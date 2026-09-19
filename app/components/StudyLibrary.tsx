"use client";
import {useEffect,useState} from "react";
import type {Study} from "@/lib/types";
export function StudyLibrary({currentId,onSelect}:{currentId:string;onSelect:(study:Study,revision:number)=>void}) {
 const [rows,setRows]=useState<{id:string;client_id:string;title:string;archived_at:string|null}[]>([]);
 const [page,setPage]=useState(0),[more,setMore]=useState(false),[message,setMessage]=useState("");
 async function load(){const r=await fetch(`/api/studies/library?page=${page}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setRows(d.studies);setMore(d.hasMore);}
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[page]);
 async function open(id:string){try{const r=await fetch(`/api/studies/library?id=${id}`);const d=await r.json();if(!r.ok)throw new Error(d.error);onSelect(d.snapshot,d.revision);}catch(e){setMessage(e instanceof Error?e.message:"Could not open study.");}}
 async function change(id:string,action:string){if(!window.confirm(action==="archive"?"Archive this study? It can be restored from this list.":"Restore this study?"))return;try{const r=await fetch("/api/studies/library",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();}catch(e){setMessage(e instanceof Error?e.message:"Please try again.");}}
 return <section className="page-pad"><h2>Saved studies</h2><p>Open another study or restore an archived one. To archive the current study, open or create another study first.</p>{message&&<p role="status">{message}</p>}{rows.map(s=><div className="saved-form-library" key={s.id}><b>{s.title}{s.archived_at?" · Archived":""}</b>{!s.archived_at&&<button className="outline-button" onClick={()=>open(s.id)}>Open</button>}<button className="outline-button" disabled={s.client_id===currentId&&!s.archived_at} onClick={()=>change(s.id,s.archived_at?"restore":"archive")}>{s.archived_at?"Restore":"Archive"}</button></div>)}<div className="response-actions"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button disabled={!more} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>;
}
