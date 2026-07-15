import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
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

    // 1. Get the worker and their department
    const { data: worker } = await supabase
      .from('field_workers')
      .select('*, departments(department_name)')
      .eq('auth_user_id', user.id)
      .single();

    const workerDept = Array.isArray((worker as any)?.departments)
      ? (worker as any).departments[0]
      : (worker as any)?.departments;
      
    const myVillageName = (workerDept?.department_name || "").toLowerCase();

    if (!myVillageName) {
      return NextResponse.json({ success: false, error: 'No Village assigned' }, { status: 400 });
    }

    // 2. Fetch ONLY resolved/completed tickets 
    // FIX: Ordered by 'created_at' to prevent the crash, since 'resolved_at' isn't in this table!
    const { data: allReports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .in('status', ['resolved', 'Resolved', 'completed', 'Completed'])
      .order('created_at', { ascending: false }); 

    if (reportsError) throw reportsError;

    // 3. Filter for Waste Domain
    const garbageReports = (allReports || []).filter((r) => {
      const type = (r.issue_type || '').toLowerCase();
      return ['garbage', 'dumping', 'waste', 'trash', 'litter', 'c_and_d', 'garbage overflow'].some(keyword => type.includes(keyword));
    });

    // 4. FIX: Fetch the matching Work Orders so we can grab 'resolved_at' and the photo!
    const reportIds = garbageReports.map(r => r.id);
    let workOrders: any[] = [];
    
    if (reportIds.length > 0) {
        // Find all work orders connected to these reports
        const { data: woData } = await supabase
            .from('work_orders')
            .select('report_uuid, report_id, resolved_at, resolution_image_url')
            .in('report_uuid', reportIds);
            
        workOrders = woData || [];
    }

    // 5. Check Territory and Format
    const formattedTickets = garbageReports.map((report) => {
      const reportVillage = (report.village_name || report.assigned_department || report.department_name || 'Unknown').toLowerCase();
      const isMine = myVillageName && (myVillageName.includes(reportVillage) || reportVillage.includes(myVillageName));
      
      // Match the work order to this report
      const matchingWO = workOrders.find(wo => String(wo.report_uuid) === String(report.id) || String(wo.report_id) === String(report.id));

      return {
        ...report,
        village_name: report.village_name || report.assigned_department || 'Mapped Location',
        worker_name: worker?.worker_name || 'Verified Contractor',
        resolved_at: matchingWO?.resolved_at || report.created_at, // Inject from work_orders!
        resolution_photo_url: matchingWO?.resolution_image_url || report.resolution_photo_url, // Inject from work_orders!
        is_my_territory: isMine 
      };
    }).filter(t => t.is_my_territory); 

    // 6. Sort them locally by the actual resolved time
    formattedTickets.sort((a, b) => {
        const timeA = new Date(a.resolved_at).getTime();
        const timeB = new Date(b.resolved_at).getTime();
        return timeB - timeA; // Newest resolutions first
    });

    return NextResponse.json({
      success: true,
      tickets: formattedTickets
    });

  } catch (error: any) {
    console.error("Resolved API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}