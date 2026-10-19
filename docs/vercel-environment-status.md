# Inside914 Vercel Supabase environment configuration

Existing project: inside914 (`prj_baND2hmY5OIm3T8s9HmmTYTRYutM`), team mypenguin19s-projects. No deployment, push, merge, or production data writes were performed.

| Scope | Variable | Status |
|---|---|---|
| Production | NEXT_PUBLIC_SUPABASE_URL | Set to https://hsexthbomretpmqolkqw.supabase.co |
| Production | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Set to the enabled modern publishable key from the new production project |
| Production | SUPABASE_SECRET_KEY | Pending: connector cannot retrieve server secrets; owner must enter new project's key directly |
| Preview | All Supabase variables | Unset; no dedicated Inside914 preview database exists |
| Development | NEXT_PUBLIC_SUPABASE_URL | Set to http://127.0.0.1:54321 |
| Development | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Set to this workspace's isolated native Supabase key |
| Development | SUPABASE_SECRET_KEY | Set to this workspace's isolated native Supabase server key |

Each variable was created in one environment scope only. Production credentials were not shared with Preview or Development. Development credentials refer only to the currently running local stack on this Mac; they are not portable to another developer's local Supabase instance. Development-only values use Vercel Config storage for local env retrieval; the server key has no NEXT_PUBLIC prefix. Production server secret should use Secret storage.

Remaining secure handoff:

1. Open [the new Supabase project's API Keys](https://supabase.com/dashboard/project/hsexthbomretpmqolkqw/settings/api-keys) and copy its NEW secret key.
2. Open [existing Vercel project environment settings](https://vercel.com/mypenguin19s-projects/inside914/settings/environment-variables).
3. Add SUPABASE_SECRET_KEY, choose Production only and Secret type, and paste it directly there. Do not send the key through chat. Do not redeploy.
4. Preview remains safely unconfigured until a dedicated nonproduction project is supplied or separately provisioned. Never substitute the production URL/key for Preview. Do not put localhost into Preview: cloud deployments cannot reach this Mac's loopback services.

No Stripe, Resend, pricing, cron or Auth configuration was changed by this request. Those remain separate setup steps in the restoration plan. Environment changes apply to future deployments; the existing deployment has not been reconnected or verified end-to-end.
