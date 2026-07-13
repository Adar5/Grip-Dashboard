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

    const myVillageName = worker?.departments?.department_name;
    if (!myVillageName) {
      return NextResponse.json({ success: false, error: 'No Village assigned' }, { status: 400 });
    }

    // 1. Fetch only active (non-completed) reports
    const { data: allReports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .neq('status', 'completed')
      .neq('status', 'resolved')
      .neq('status', 'pending');

    if (reportsError) throw reportsError;

    // 2. FILTER: Keep only garbage/waste reports (Exclude potholes/roads)
    const garbageReports = (allReports || []).filter((r) => {
      const type = (r.issue_type || '').toLowerCase();
      return ['garbage', 'dumping', 'waste', 'trash', 'litter', 'c_and_d', 'garbage overflow'].some(keyword => type.includes(keyword));
    });

    // 3. Format the filtered data
    const formattedTickets = garbageReports.map((report) => {
      const reportVillage = report.village_name || 'Unknown Village';
      const isMine = myVillageName.includes(reportVillage) || reportVillage.includes(myVillageName);

      return {
        ...report,
        village_name: reportVillage,
        is_my_territory: isMine 
      };
    });

    // 4. Calculate pending count (Including escalated items)
    const pendingCount = formattedTickets.filter(t => 
      t.is_my_territory && (t.status === 'pending' || t.status === 'escalated')
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