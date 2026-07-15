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
    if (authError || !user ) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const safeUserEmail = user.email.trim().toLowerCase();
    const { data: allDepts } = await supabase.from("departments").select("*");

    let workerProfile:any = null;
    let myDept = null;
    let role = 'JE';
    let eeDistrict: string | null = null;
    
    // 1. Fetch Field Worker profile first (Absolute source of truth)
    const { data: worker } = await supabase.from("field_workers").select("*").ilike("email", safeUserEmail).single();
    workerProfile = worker;

    if (workerProfile) {
      const spec = (workerProfile.specialty || "").toLowerCase();
      
      if (workerProfile.hierarchy_level === 5 || spec.includes("chief")) {
        role = 'CE';
      } else if (workerProfile.hierarchy_level === 4 || spec.includes("executive")) {
        role = 'EE';
        eeDistrict = spec.includes("north") ? "North Goa" : "South Goa";
      } else if (workerProfile.hierarchy_level === 3 || spec.includes("assistant engineer") || spec === "ae") {
        // THE FIX: Strict AE matching! "Assistant" alone is no longer enough to get manager privileges.
        role = 'AE';
        myDept = allDepts?.find(d => String(d.id) === String(workerProfile.department_id));
      } else {
        // All other workers (including Assistant Linemen, etc.) are safely locked here as JEs.
        role = 'JE';
        myDept = allDepts?.find(d => String(d.id) === String(workerProfile.department_id));
      }
    } 
    
    // 2. Fallback for AEs who are ONLY in the departments table
    if (!workerProfile) {
      const aeDept = allDepts?.find(d => d.contact_email && d.contact_email.trim().toLowerCase() === safeUserEmail);
      if (aeDept) {
        role = 'AE';
        myDept = aeDept;
      }
    }

    if (!myDept && !workerProfile) return NextResponse.json({ success: false, error: "Profile not found." }, { status: 403 });

    let relevantWorkOrders: any[] = [];
    let departmentWorkers: any[] = [];

    if (role === 'CE') {
      const { data: workers } = await supabase.from("field_workers").select("id, worker_name, department_id");
      departmentWorkers = workers || [];
      const workerIds = departmentWorkers.map(w => w.id);
      if (workerIds.length > 0) {
        const { data: wo } = await supabase.from("work_orders")
          .select("*")
          .in("worker_id", workerIds)
          .neq("status", "Resolved")
          .neq("status", "Completed")
          .gte("escalation_level", 3);
        relevantWorkOrders = wo || [];
      }
    } else if (role === 'EE') {
      const searchKeyword = eeDistrict?.includes("North") ? "North" : "South";
      const districtDepts = allDepts?.filter(d => d.district && d.district.includes(searchKeyword)) || [];
      const deptIds = districtDepts.map(d => d.id);
      
      if (deptIds.length > 0) { 
          const { data: workers } = await supabase.from("field_workers").select("id, worker_name, department_id").in("department_id", deptIds);
          departmentWorkers = workers || [];
          const workerIds = departmentWorkers.map(w => w.id);
          if (workerIds.length > 0) {
            const { data: wo } = await supabase.from("work_orders")
              .select("*")
              .in("worker_id", workerIds)
              .neq("status", "Resolved")
              .neq("status", "Completed")
              .eq("status", "Pending");
            relevantWorkOrders = wo || [];
          }
      }
    } else if (role === 'AE') {
      const { data: workers, error: workerErr } = await supabase
        .from("field_workers")
        .select("id, worker_name, department_id")
        .eq("department_id", myDept?.id);

      if (workerErr) console.error("🚨 [AE ERROR] Failed to fetch JEs:", workerErr);

      departmentWorkers = workers || [];
      const workerIds = departmentWorkers.map(w => w.id);

      if (workerIds.length > 0) {
        const { data: wo, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .in("worker_id", workerIds)
          .neq("status", "Resolved")
          .neq("status", "Completed");

        if (woErr) console.error("🚨 [AE ERROR] Failed to fetch Work Orders:", woErr);
        relevantWorkOrders = wo || [];
      }
    } else {
      // THE RESULT: The JE is now safely locked into this block, 
      // where Supabase STRICTLY filters by their exact personal workerProfile.id!
      const { data: wo } = await supabase
        .from("work_orders")
        .select("*")
        .eq("worker_id", workerProfile.id)
        .neq("status", "Resolved")
        .neq("status", "Completed");
      relevantWorkOrders = wo || [];
    }

    const reportIdentifiers = relevantWorkOrders.map(wo => wo.report_uuid || wo.report_id).filter(Boolean);
    if (reportIdentifiers.length === 0) return NextResponse.json({ success: true, role, reports: [] });

    const { data: allReports, error: reportsError } = await supabase.from("reports").select("*");
    
    if (reportsError) console.error("Database Error:", reportsError);
    
    const now = new Date().getTime();

    const activeTickets = relevantWorkOrders.map(wo => {
      const targetId = String(wo.report_uuid || wo.report_id);
      
      const report = allReports?.find(r => 
         String(r.id) === targetId || String(r.uuid) === targetId
      );
      
      let assignedWorkerName = "Unknown JE";
      if (role === 'AE' || role === 'EE' || role === 'CE') {
          const worker = departmentWorkers.find(w => String(w.id) === String(wo.worker_id));
          if (worker) {
              assignedWorkerName = worker.worker_name;
              if (role === 'EE' || role === 'CE') {
                  const wDept = allDepts?.find(d => d.id === worker.department_id);
                  if (wDept) assignedWorkerName += ` (${wDept.taluka_name})`;
              }
          }
      } else {
          assignedWorkerName = workerProfile.worker_name;
      }

      let riskStatus = "On Track";
      let hoursRemaining = 99;

      if (wo.due_date) {
        const dueTime = new Date(wo.due_date).getTime();
        hoursRemaining = Math.round((dueTime - now) / (1000 * 60 * 60));
        if (hoursRemaining < 0) riskStatus = "Breached";
        else if (hoursRemaining < 24) riskStatus = "High Risk";
      }

      return {
        id: targetId, 
        issue_type: report?.issue_type || "Infrastructure Issue",
        village_name: report?.village_name || report?.assigned_department || "Location Not Logged",
        timestamp: report?.created_at,
        status: wo.status || "Pending",
        latitude: report?.latitude,
        longitude: report?.longitude,
        image_path: report?.image_url || report?.image_path || null, 
        worker_name: assignedWorkerName,
        hours_remaining: Math.abs(hoursRemaining),
        risk_status: riskStatus
      };
    });

    let finalReports = activeTickets;
    if (role !== 'JE') {
        finalReports = activeTickets.filter(ticket => {
            const typeStr = (ticket.issue_type || "").toLowerCase();
            return typeStr.includes("pothole"); 
        });
    }

    return NextResponse.json({ success: true, role, reports: finalReports });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}