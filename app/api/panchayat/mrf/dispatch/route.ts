import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  try {
    // 1. Verify Authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Get the weight and panchayat name sent from the frontend button
    const { weight, panchayat } = await request.json();

    if (!weight || !panchayat) {
      return NextResponse.json({ error: 'Missing weight or panchayat data' }, { status: 400 });
    }

    // 3. Find out if this Panchayat is in North or South Goa
    const { data: dept } = await supabase
      .from('departments')
      .select('district')
      .eq('department_name', panchayat)
      .single();

    const district = dept?.district || 'North Goa'; // Fallback to North
    
    // 4. Determine Logic based on District
    const recipientEmail = district.includes('North') 
        ? 'gwmc.north@grip-goa.online' 
        : 'gwmc.south@grip-goa.online';
        
    const destinationPlant = district.includes('North') 
        ? 'Saligao ISWMF' 
        : 'Cacora ISWMF';

    // 5. Save the Dispatch to the Database
    const { error: dbError } = await supabase
      .from('mrf_outward')
      .insert({
        panchayat_name: panchayat,
        declared_weight_kg: weight,
        destination_plant: destinationPlant,
        status: "Pending GWMC"
      });

    if (dbError) throw dbError;

    // 6. Generate the HTML Email Template
    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #2563eb; color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 22px;">🚛 MRF Dispatch Request</h2>
      </div>
      <div style="padding: 30px; background-color: #ffffff; color: #334155;">
        <p style="font-size: 16px; margin-top: 0;">Attention <b>GWMC Logistics Team</b>,</p>
        <p style="font-size: 16px; line-height: 1.5;">The Material Recovery Facility (MRF) at <b>${panchayat}</b> has reached capacity and requires an urgent pickup.</p>
        <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0;">
          <p style="margin: 0 0 10px 0; font-size: 16px;"><strong>🏢 Origin:</strong> ${panchayat} MRF</p>
          <p style="margin: 0 0 10px 0; font-size: 16px;"><strong>⚖️ Declared Load:</strong> ${weight.toLocaleString()} kg</p>
          <p style="margin: 0; font-size: 16px;"><strong>🏭 Destination Plant:</strong> <span style="color: #1d4ed8; font-weight: bold;">${destinationPlant}</span></p>
        </div>
        <p style="font-size: 16px; line-height: 1.5;">Please assign a collection vehicle and routing manifest as soon as possible.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://grip-goa.online" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 5px; display: inline-block;">Open GWMC Dashboard</a>
        </div>
      </div>
    </div>
    `;

    // 7. Send the Email via Resend API
    // Ensure you have RESEND_API_KEY in your .env.local file!
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: "GRIP Dispatch <alerts@grip-goa.online>",
        to: [recipientEmail],
        subject: `🚛 Urgent: MRF Pickup Request - ${panchayat}`,
        html: emailHtml
      })
    });

    if (!emailResponse.ok) {
      const emailError = await emailResponse.json();
      console.error("Email sending failed:", emailError);
      // Note: We don't throw an error here because the Database insert already succeeded!
    }

    return NextResponse.json({ success: true, message: "Dispatch logged and email sent!" });

  } catch (error: any) {
    console.error("Dispatch API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}