"use client";
import {Archive, ArrowRight, RotateCcw} from "lucide-react";
import {useEffect,useState} from "react";
import type {Study} from "@/lib/types";
export function StudyLibrary({currentId,onSelect}:{currentId:string;onSelect:(study:Study,revision:number)=>void}) {
 const [rows,setRows]=useState<{id:string;client_id:string;title:string;updated_at:string;archived_at:string|null}[]>([]);
 const [page,setPage]=useState(0),[more,setMore]=useState(false),[message,setMessage]=useState("");
 async function load(){const r=await fetch(`/api/studies/library?page=${page}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setRows(d.studies);setMore(d.hasMore);}
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[page]);
 async function open(id:string){try{const r=await fetch(`/api/studies/library?id=${id}`);const d=await r.json();if(!r.ok)throw new Error(d.error);onSelect(d.snapshot,d.revision);}catch(e){setMessage(e instanceof Error?e.message:"Could not open study.");}}
 async function change(id:string,action:string){if(!window.confirm(action==="archive"?"Archive this study? It can be restored from this list.":"Restore this study?"))return;try{const r=await fetch("/api/studies/library",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();}catch(e){setMessage(e instanceof Error?e.message:"Please try again.");}}
 const formatUpdated=(value:string)=>new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));
 return <section className="study-library-panel page-pad">
  <header><div><span className="eyebrow">YOUR LIBRARY</span><h2>Saved studies</h2><p>Switch research projects or restore something you archived.</p></div><span>{rows.length} on this page</span></header>
  {message&&<p className="study-library-message" role="status">{message}</p>}
  {rows.length===0?<div className="study-library-empty"><h3>No saved studies yet</h3><p>Create a study to keep its brief, interviews and findings together.</p></div>:<div className="study-library-list">{rows.map(s=>{
   const active=s.client_id===currentId&&!s.archived_at;
   return <article className={`study-library-row ${active?"active":""}`} key={s.id}>
    <span className="study-monogram" aria-hidden="true">{(s.title.trim()[0]??"S").toUpperCase()}</span>
    <div><div className="study-library-title"><h3>{s.title}</h3>{active&&<span>Current</span>}{s.archived_at&&<span className="archived">Archived</span>}</div><p>Updated {formatUpdated(s.updated_at)}</p></div>
    <div className="study-library-actions">{!s.archived_at&&<button className="outline-button" disabled={active} onClick={()=>open(s.id)}>{active?"Open now":"Open"}{!active&&<ArrowRight size={15}/>}</button>}<button className="text-button" disabled={active} onClick={()=>change(s.id,s.archived_at?"restore":"archive")}>{s.archived_at?<><RotateCcw size={15}/>Restore</>:<><Archive size={15}/>Archive</>}</button></div>
   </article>})}</div>}
  {(page>0||more)&&<nav className="study-library-pages" aria-label="Saved studies pages"><button className="outline-button" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button className="outline-button" disabled={!more} onClick={()=>setPage(p=>p+1)}>Next</button></nav>}
 </section>;
}
