import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Helper to create admin client with service_role key
function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}

// Verify if the current user is an admin
async function verifyAdmin(request: NextRequest) {
    const cookieStore = await cookies()
    const token = cookieStore.get('sb-access-token')?.value

    if (!token) {
        return null
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    return profile?.role === 'admin' ? user : null
}

export async function POST(request: NextRequest) {
    try {
        // 1. Verify admin
        const admin = await verifyAdmin(request)
        if (!admin) {
            return NextResponse.json(
                { error: 'Unauthorized: Admin access required' },
                { status: 403 }
            )
        }

        // 2. Get user ID to delete
        const { userId } = await request.json()
        if (!userId) {
            return NextResponse.json(
                { error: 'Missing userId' },
                { status: 400 }
            )
        }

        // 3. Prevent self-deletion
        if (userId === admin.id) {
            return NextResponse.json(
                { error: 'Cannot delete your own account' },
                { status: 400 }
            )
        }

        const adminClient = createAdminClient()

        // 4. Delete user data in order (CASCADE should handle most, but explicit is safer)

        // 4a. Delete quiz results
        const { error: quizError } = await adminClient
            .from('quiz_results')
            .delete()
            .eq('user_id', userId)

        if (quizError) {
            console.error('Failed to delete quiz_results:', quizError)
            // Continue anyway, might not exist
        }

        // 4b. Delete user progress
        const { error: progressError } = await adminClient
            .from('user_progress')
            .delete()
            .eq('user_id', userId)

        if (progressError) {
            console.error('Failed to delete user_progress:', progressError)
        }

        // 4c. Delete profile (this should cascade to auth.users if FK is set correctly)
        const { error: profileError } = await adminClient
            .from('profiles')
            .delete()
            .eq('id', userId)

        if (profileError) {
            console.error('Failed to delete profile:', profileError)
            return NextResponse.json(
                { error: 'Failed to delete profile: ' + profileError.message },
                { status: 500 }
            )
        }

        // 4d. Delete from auth.users (using Admin API)
        const { error: authError } = await adminClient.auth.admin.deleteUser(userId)

        if (authError) {
            console.error('Failed to delete auth user:', authError)
            return NextResponse.json(
                { error: 'Failed to delete auth user: ' + authError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'User and all related data deleted successfully'
        })

    } catch (error: any) {
        console.error('Delete user error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
