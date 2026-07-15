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
    if (authError || !user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const safeUserEmail = user.email.trim().toLowerCase();
    const { data: allDepts } = await supabase.from("departments").select("*");

    const aeDept = allDepts?.find(d => d.contact_email && d.contact_email.trim().toLowerCase() === safeUserEmail);

    let workerProfile: any = null;
    let myDept = aeDept;
    let role = 'JE';
    let eeDistrict = null;
    
    if (aeDept) {
      role = 'AE';
    } else {
      const { data: worker } = await supabase.from("field_workers").select("*").ilike("email", safeUserEmail).single();
      workerProfile = worker;
      
      if (workerProfile) {
        const spec = (workerProfile.specialty || "").toLowerCase();
        
        if (workerProfile.hierarchy_level === 5 || spec.includes("chief")) {
          role = 'CE'; 
        } else if (workerProfile.hierarchy_level === 4 || spec.includes("executive")) {
          role = 'EE'; 
          eeDistrict = workerProfile.specialty.includes("North") ? "North" : "South";
        } else if (workerProfile.hierarchy_level === 3 || spec.includes("assistant")) {
          role = 'AE';
          myDept = allDepts?.find(d => String(d.id) === String(workerProfile.department_id));
        } else {
          role = 'JE';
          myDept = allDepts?.find(d => String(d.id) === String(workerProfile.department_id));
        }
      }
    }

    if (!aeDept && !workerProfile) return NextResponse.json({ success: false, error: "ACCESS DENIED: Profile not found." }, { status: 403 });

    const userName = role === 'AE' ? (aeDept?.officer_in_charge || workerProfile?.worker_name) : workerProfile.worker_name;
    const userLevel = role === 'AE' ? (workerProfile?.hierarchy_level || 1) : workerProfile.hierarchy_level;
    const userTaluka = role === 'CE' ? "State of Goa" : role === 'EE' ? `${eeDistrict} District` : (myDept?.taluka_name || "Unknown");

    let relevantWorkOrders: any[] = [];
    let departmentWorkers: any[] = [];

    // --- FIX 1: REMOVED ESCALATION FILTERS SO MANAGERS SEE ALL TICKETS IN TERRITORY ---
    if (role === 'CE') {
      const { data: workers } = await supabase.from("field_workers").select("id, worker_name, department_id");
      departmentWorkers = workers || [];
      const workerIds = departmentWorkers.map(w => w.id);
      if (workerIds.length > 0) {
        const { data: wo } = await supabase.from("work_orders").select("*").in("worker_id", workerIds);
        relevantWorkOrders = wo || [];
      }
    } else if (role === 'EE') {
      const districtDepts = allDepts?.filter(d => d.district && d.district.includes(eeDistrict!)) || [];
      const deptIds = districtDepts.map(d => d.id);
      
      if (deptIds.length > 0) {
        const { data: workers } = await supabase.from("field_workers").select("id, worker_name, department_id").in("department_id", deptIds);
        departmentWorkers = workers || [];
        const workerIds = departmentWorkers.map(w => w.id);
        if (workerIds.length > 0) {
          const { data: wo } = await supabase.from("work_orders").select("*").in("worker_id", workerIds);
          relevantWorkOrders = wo || [];
        }
      }
    } else if (role === 'AE') {
      const { data: workers } = await supabase.from("field_workers").select("id, worker_name, department_id").eq("department_id", myDept?.id);
      departmentWorkers = workers || [];
      const workerIds = departmentWorkers.map(w => w.id);
      if (workerIds.length > 0) {
        const { data: wo } = await supabase.from("work_orders").select("*").in("worker_id", workerIds);
        relevantWorkOrders = wo || [];
      }
    } else {
      const { data: wo } = await supabase.from("work_orders").select("*").eq("worker_id", workerProfile.id);
      relevantWorkOrders = wo || [];
    }

    const { data: allReports } = await supabase.from("dashboard_reports").select("*");

    const processedTickets = allReports?.map((report) => {
        const matchingWorkOrder = relevantWorkOrders.find((wo) => {
            const woId = wo.report_uuid || wo.report_id;
            const reportId = report.uuid || report.id;
            return String(woId) === String(reportId);
        });
        
        let isMine = !!matchingWorkOrder;

        // --- FIX 2: GEOGRAPHIC FALLBACK ---
        // If the ticket has no work order, check if it geographically belongs to the manager
        if (!isMine) {
            if (role === 'CE') {
                isMine = true; 
            } else if (role === 'EE' && eeDistrict) {
                const rDistrict = String(report.district_name || report.department_name || report.assigned_department || "").toLowerCase();
                if (rDistrict.includes(eeDistrict.toLowerCase())) isMine = true;
            } else if (role === 'AE' && myDept) {
                const rDept = String(report.department_name || report.assigned_department || "").toLowerCase();
                const myDeptName = String(myDept.department_name || "").toLowerCase();
                if (myDeptName && rDept.includes(myDeptName)) isMine = true;
            }
        }

        let assignedWorkerName = "Other Division";
        if (isMine) {
            if (role === 'AE' || role === 'EE' || role === 'CE') {
                if (matchingWorkOrder) {
                    const assignedWorker = departmentWorkers.find(w => String(w.id) === String(matchingWorkOrder.worker_id));
                    if (assignedWorker) {
                        assignedWorkerName = assignedWorker.worker_name;
                        if (role === 'EE' || role === 'CE') {
                            const wDept = allDepts?.find(d => d.id === assignedWorker.department_id);
                            if (wDept) assignedWorkerName += ` (${wDept.taluka_name})`;
                        }
                    } else {
                        assignedWorkerName = "Unassigned JE";
                    }
                } else {
                    assignedWorkerName = "Awaiting Assignment";
                }
            } else {
                assignedWorkerName = workerProfile.worker_name;
            }
        }

        let type = report.issue_type || "Pothole / Issue";
        if (type.toLowerCase().includes("massive") || type.toLowerCase().includes("high severity")) type = "Major Pothole";

        const locationLabel = [
          report.village_name,
          report.assigned_department,
          report.department_name,
          report.taluka_name,
          report.district_name,
        ].find((value) => value && String(value).trim()) || 
          (report.latitude && report.longitude
            ? `Lat ${Number(report.latitude).toFixed(4)}, Lng ${Number(report.longitude).toFixed(4)}`
            : "Coordinates logged");

        return {
          id: report.id,
          latitude: report.latitude, 
          longitude: report.longitude,
          display_type: type,
          status: matchingWorkOrder ? matchingWorkOrder.status : "Pending",
          is_my_territory: isMine,
          worker_name: assignedWorkerName,
          ai_predictions: report.ai_predictions,
          village_name: locationLabel,
          location_label: locationLabel,
        };
      }) || [];

    const activeTicketsOnly = processedTickets.filter((t) => {
      const statusText = (t.status || "").toLowerCase();
      const isResolved = statusText === "resolved" || statusText === "completed";
      const isPotholeOrMine = t.display_type.toLowerCase().includes("pothole") || t.is_my_territory;
      return !isResolved && isPotholeOrMine;
    });

    const displayDepartmentName = role === 'CE' ? "Goa State Operations" : role === 'EE' ? `${eeDistrict} Operations` : (myDept?.department_name || "Unknown");

    return NextResponse.json({
      success: true,
      currentUser: { name: userName, level: userLevel, taluka: userTaluka, role: role },
      departments: [{
          department_name: displayDepartmentName,
          tickets: activeTicketsOnly,
          total_reports: activeTicketsOnly.length,
          pending_reports: activeTicketsOnly.filter((t) => t.is_my_territory).length,
      }],
    });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}