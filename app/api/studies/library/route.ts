import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readJson, apiError, HttpError } from "@/lib/http";
import { hasTrustedOrigin } from "@/lib/security";
export async function GET(request: Request) {
  try {
    const user = await requireUser(); const db = await createSupabaseServerClient();
    if (!db) throw new HttpError("Storage is unavailable.",503);
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      z.string().uuid().parse(id);
      const { data, error } = await db.from("studies").select("id,snapshot,revision").eq("id",id).eq("owner_id",user.id).is("archived_at",null).maybeSingle();
      if (error) throw error; if (!data) throw new HttpError("Study unavailable.",404);
      return NextResponse.json(data, {headers:{"Cache-Control":"no-store"}});
    }
    const page = z.coerce.number().int().min(0).max(10000).parse(params.get("page") ?? 0);
    const {data,error,count} = await db.from("studies").select("id,client_id,title,updated_at,archived_at", {count:"exact"}).eq("owner_id",user.id).order("updated_at",{ascending:false}).range(page*25,page*25+24);
    if(error) throw error;
    return NextResponse.json({studies:data,hasMore:(page+1)*25<(count??0)}, {headers:{"Cache-Control":"no-store"}});
  } catch(error) {return apiError(error);}
}
export async function POST(request: Request) {
  try {
    if(!hasTrustedOrigin(request)) throw new HttpError("Request origin is not allowed.",403);
    const user=await requireUser(); const db=await createSupabaseServerClient();
    if(!db) throw new HttpError("Storage is unavailable.",503);
    const input=z.object({id:z.string().uuid(),action:z.enum(["archive","restore"])}).parse(await readJson(request,1000));
    const {data,error}=await db.from("studies").update({archived_at:input.action==="archive"?new Date().toISOString():null}).eq("id",input.id).eq("owner_id",user.id).select("id").maybeSingle();
    if(error) throw error; if(!data) throw new HttpError("Study unavailable.",404);
    return NextResponse.json({ok:true});
  } catch(error) {return apiError(error);}
}
