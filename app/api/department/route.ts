import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const safeUserEmail = user.email.trim().toLowerCase();
    
    const { data: allDepts } = await supabase.from("departments").select("*");
    const aeDept = allDepts?.find(d => d.contact_email && d.contact_email.trim().toLowerCase() === safeUserEmail);

    let workerProfile = null;
    let myDept = aeDept;
    let role = 'JE';
    let eeDistrict = null;
    
    if (aeDept) {
      role = 'AE';
    } else {
      const { data: worker } = await supabase.from("field_workers").select("*").ilike("email", safeUserEmail).single();
      workerProfile = worker;
      if (workerProfile) {
        if (workerProfile.hierarchy_level === 5) {
          role = 'CE';
        } else if (workerProfile.hierarchy_level === 4) {
          role = 'EE';
          eeDistrict = workerProfile.specialty.includes("North") ? "North Goa" : "South Goa";
        } else {
          role = 'JE';
          myDept = allDepts?.find(d => String(d.id) === String(workerProfile.department_id));
        }
      }
    }

    if (!aeDept && !workerProfile) return NextResponse.json({ success: false, error: "Profile not found." }, { status: 403 });

    const userName = role === 'AE' ? aeDept.officer_in_charge : workerProfile.worker_name;
    
    let targetDepartments: any[] = [];
    
    // FIX: Strictly filter for 'PWD_DIVISION' so Health and BDO are ignored for higher officials
    if (role === 'CE') {
      targetDepartments = allDepts?.filter(d => d.department_type === 'PWD_DIVISION') || []; 
    } else if (role === 'EE') {
      targetDepartments = allDepts?.filter(d => d.district === eeDistrict && d.department_type === 'PWD_DIVISION') || []; 
    } else {
      targetDepartments = myDept ? [myDept] : []; 
    }

    if (targetDepartments.length === 0) {
      return NextResponse.json({ success: true, currentUser: { name: userName, role }, departments: [] });
    }

    const deptIds = targetDepartments.map(d => d.id);

    const { data: workers } = await supabase.from("field_workers").select("*").in("department_id", deptIds);
    const safeWorkers = workers || [];
    const workerIds = safeWorkers.map(w => w.id);

    let workOrders: any[] = [];
    if (workerIds.length > 0) {
      const { data: wo } = await supabase.from("work_orders").select("id, status, escalation_level, worker_id").in("worker_id", workerIds);
      workOrders = wo || [];
    }

    const enrichedDepartments = targetDepartments.map(dept => {
      // 1. Group workers belonging to this specific department
      const deptWorkers = safeWorkers.filter(w => String(w.department_id) === String(dept.id));
      const deptWorkerIds = deptWorkers.map(w => String(w.id));
      
      // 2. Find all work orders assigned to these workers
      const deptOrders = workOrders.filter(wo => deptWorkerIds.includes(String(wo.worker_id)));

      // 3. Calculate exact Performance KPIs
      let total = deptOrders.length;
      let pending = 0;
      let resolved = 0;
      let escalated = 0;
      let resolvedOnTime = 0;

      deptOrders.forEach(wo => {
         const isResolved = (wo.status || '').toLowerCase() === 'resolved' || (wo.status || '').toLowerCase() === 'completed';
         
         if (isResolved) resolved++;
         else pending++;

         // If escalation_level is > 0, someone missed a deadline!
         if (wo.escalation_level > 0) {
             escalated++;
         } else if (isResolved && wo.escalation_level === 0) {
             resolvedOnTime++; // They finished it without it ever being escalated
         }
      });

      // Calculate SLA Compliance percentage
      const totalResolvedOrEscalated = resolvedOnTime + escalated;
      const complianceRate = totalResolvedOrEscalated > 0 
        ? Math.round((resolvedOnTime / totalResolvedOrEscalated) * 100) 
        : 100; // Default to 100% if no tickets have breached or resolved yet

      return {
        department_id: dept.id,
        department_name: dept.department_name,
        taluka_name: dept.taluka_name,
        district: dept.district,
        officer_in_charge: dept.officer_in_charge,
        metrics: {
          total_reports: total,
          pending_reports: pending,
          resolved_reports: resolved,
          escalated_reports: escalated,
          resolved_on_time: resolvedOnTime,
          compliance_rate: complianceRate
        },
        workers: deptWorkers.map(w => ({
            id: w.id,
            worker_name: w.worker_name,
            email: w.email,
            hierarchy_level: w.hierarchy_level,
            specialty: w.specialty
        }))
      };
    });

    return NextResponse.json({
      success: true,
      currentUser: { 
          name: userName, 
          role: role,
          scope: role === 'CE' ? 'Goa State' : role === 'EE' ? `${eeDistrict} District` : (myDept?.taluka_name || 'Division')
      },
      departments: enrichedDepartments.sort((a, b) => (a.taluka_name || '').localeCompare(b.taluka_name || ''))
    });

  } catch (error: any) {
    console.error("Departments API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}