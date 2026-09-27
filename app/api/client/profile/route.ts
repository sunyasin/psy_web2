import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isValidUuid } from "@/lib/subscription";

export async function GET(request: NextRequest) {
  try {
    const clientUuid = request.nextUrl.searchParams.get("client_uuid");
    if (!isValidUuid(clientUuid)) {
      return NextResponse.json({ error: "Valid client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: client, error } = await supabase
      .from("clients")
      .select("display_name, email")
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load client" },
        { status: 500 }
      );
    }
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      display_name: client.display_name ?? "",
      email: client.email ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const clientUuid: string | undefined = body?.client_uuid;
    const login: string | undefined = body?.login;
    const email: string | undefined = body?.email;
    const password: string | undefined = body?.password;

    const emailValue = login || email;

    if (!isValidUuid(clientUuid) || !emailValue || !password) {
      return NextResponse.json(
        { error: "client_uuid, login (email) и password обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email")
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const oldEmail = client.email;
    const emailChanged = Boolean(oldEmail) && oldEmail !== emailValue;

    const { error: updateError } = await supabase
      .from("clients")
      .update({ email: emailValue, updated_at: new Date().toISOString() })
      .eq("client_uuid", clientUuid);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to update client" },
        { status: 500 }
      );
    }

    let authUpdateError: string | null = null;

    try {
      if (oldEmail) {
        const { data: userData, error: lookupError } = await supabase.auth.admin.getUserByEmail(
          oldEmail
        );
        if (lookupError) {
          authUpdateError = lookupError.message || "Failed to find auth user";
        } else if (!userData?.user) {
          authUpdateError = "Учётная запись для входа не найдена";
        } else {
          const { error: authErr } = await supabase.auth.admin.updateUser(userData.user.id, {
            ...(emailChanged ? { email: emailValue } : {}),
            password,
          });
          if (authErr) authUpdateError = authErr.message;
        }
      } else {
        authUpdateError = "Учётная запись для входа не найдена";
      }
    } catch (err) {
      authUpdateError = err instanceof Error ? err.message : "Failed to update auth user";
    }

    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError }, { status: 409 });
    }

    return NextResponse.json({ success: true, email: emailValue });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
