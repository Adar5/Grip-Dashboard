import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: worker } = await supabase
      .from('field_workers')
      .select('departments!inner(department_name)')
      .eq('auth_user_id', user.id)
      .single();

    const workerDept = Array.isArray((worker as any)?.departments)
      ? (worker as any).departments[0]
      : (worker as any)?.departments;
    const myVillageName = workerDept?.department_name;
    
    if (!myVillageName) {
      return NextResponse.json({ success: false, error: 'No Village assigned' }, { status: 400 });
    }

    // FIX 1: Removed .neq('status', 'pending') so new tickets actually get fetched!
    // We only want to filter out the ones that are totally finished.
    const { data: allReports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .neq('status', 'completed')
      .neq('status', 'resolved');

    if (reportsError) throw reportsError;

    // 2. FILTER: Keep only garbage/waste reports (Exclude potholes/roads)
    const garbageReports = (allReports || []).filter((r) => {
      const type = (r.issue_type || '').toLowerCase();
      return ['garbage', 'dumping', 'waste', 'trash', 'litter', 'c_and_d', 'garbage overflow'].some(keyword => type.includes(keyword));
    });

    // 3. Format the filtered data
    const formattedTickets = garbageReports.map((report) => {
      const reportVillage = report.village_name || 'Unknown Village';
      
      // FIX 2: Made the territory check case-insensitive so "Mapusa" matches "mapusa"
      const safeMyVillage = myVillageName.toLowerCase();
      const safeReportVillage = reportVillage.toLowerCase();
      const isMine = safeMyVillage.includes(safeReportVillage) || safeReportVillage.includes(safeMyVillage);

      return {
        ...report,
        village_name: reportVillage,
        is_my_territory: isMine 
      };
    });

    // 4. Calculate pending count (Including escalated items)
    const pendingCount = formattedTickets.filter(t => 
      t.is_my_territory && (t.status === 'Pending' || t.status === 'pending' || t.status === 'Dispatched' || t.status === 'Escalated' || t.status === 'Assigned')
    ).length;

    return NextResponse.json({
      success: true,
      currentUser: { jurisdiction: myVillageName },
      tickets: formattedTickets,
      pending_reports: pendingCount
    });

  } catch (error: any) {
    console.error("Panchayat API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}