import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  // 1. FIX: MUST await cookies() for Next.js 16
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Safe to ignore in API routes
          }
        },
      },
    }
  );

  try {
    // 2. Verify the user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Find exactly which Taluka this BDO oversees
    const { data: worker } = await supabase
      .from('field_workers')
      .select('departments!inner(taluka_name)')
      .eq('auth_user_id', user.id)
      .single();

    const bdoTaluka = worker?.departments?.taluka_name;

    if (!bdoTaluka) {
      return NextResponse.json({ success: false, error: 'No Taluka assigned' }, { status: 400 });
    }

    // 4. FIX: Get a list of ALL villages that belong to this BDO's Taluka
    const { data: talukaVillages } = await supabase
      .from('departments')
      .select('department_name')
      .eq('taluka_name', bdoTaluka);

    const validVillageNames = talukaVillages?.map(v => v.department_name) || [];

    // 5. FIX: Fetch ALL ACTIVE reports (Don't waste bandwidth downloading resolved tickets)
    const { data: allReports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .neq('status', 'completed')
      .neq('status', 'resolved');

    if (reportsError) throw reportsError;

    // 🌟 THE NEW GARBAGE FILTER 🌟
    // Strip out all potholes, water leaks, and infrastructure issues
    const garbageReports = (allReports || []).filter((r) => {
      const type = (r.issue_type || '').toLowerCase();
      return ['garb', 'dump', 'waste', 'trash', 'litter', 'c_and_d'].some(keyword => type.includes(keyword));
    });

    // 6. Format the data for the frontend Map and Dashboard using ONLY the garbage reports
    const formattedTickets = garbageReports.map((report) => {
      const reportVillage = report.village_name || 'Unknown Village';
      
      // THE NEW MAGIC TRICK: 
      // Check if the report's village matches ANY of the villages in this BDO's Taluka
      const isMine = validVillageNames.some(village => 
        village.includes(reportVillage) || reportVillage.includes(village)
      );
      
      return {
        ...report,
        village_name: reportVillage,
        is_my_territory: isMine 
      };
    });

    // 7. Calculate pending count (Including tickets escalated specifically to them)
    const pendingCount = formattedTickets.filter(t => 
      t.is_my_territory && (t.status === 'pending' || t.status === 'Escalated_BDO')
    ).length;

    // 8. Send the complete payload back to the dashboard
    return NextResponse.json({
      success: true,
      currentUser: { jurisdiction: bdoTaluka },
      tickets: formattedTickets,
      pending_reports: pendingCount
    });

  } catch (error: any) {
    console.error("BDO API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}