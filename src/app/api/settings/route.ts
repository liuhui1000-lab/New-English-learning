import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// Helper: Create admin client (service_role, bypasses RLS)
function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

// Helper: Verify admin from Bearer token
async function verifyAdmin(req: Request) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token', status: 401 }
    }

    const token = authHeader.replace('Bearer ', '')
    const adminClient = createAdminClient()

    // Verify the JWT token with Supabase Auth
    const { data: { user }, error } = await adminClient.auth.getUser(token)
    if (error || !user) {
        return { error: 'Unauthorized: Invalid token', status: 401 }
    }

    // Check admin role in profiles
    const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        return { error: 'Forbidden: Admin only', status: 403 }
    }

    return { user, profile }
}

// GET: Read all settings
export async function GET(req: NextRequest) {
    const authResult = await verifyAdmin(req)

    if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
        .from('system_settings')
        .select('key, value')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data })
}

// POST: Save settings (admin only)
export async function POST(req: NextRequest) {
    const authResult = await verifyAdmin(req)

    if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    // Parse request body
    const { updates } = await req.json()
    if (!updates || !Array.isArray(updates)) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Write using service_role (bypasses RLS)
    const adminClient = createAdminClient()

    const upsertData = updates.map((u: any) => ({
        key: u.key,
        value: u.value,
        updated_at: new Date().toISOString()
    }))

    const { error } = await adminClient
        .from('system_settings')
        .upsert(upsertData)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
