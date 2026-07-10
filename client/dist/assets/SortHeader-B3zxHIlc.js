import{c as i,r as h,j as t,y as u}from"./index-Crr0fNLv.js";/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=i("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=i("ChevronsUpDown",[["path",{d:"m7 15 5 5 5-5",key:"1hf1tw"}],["path",{d:"m7 9 5-5 5 5",key:"sgt6xg"}]]);function j(r="",e=""){const[n,o]=h.useState({sort:r,dir:e});return{...n,toggle:s=>o(a=>a.sort!==s?{sort:s,dir:"asc"}:a.dir==="asc"?{sort:s,dir:"desc"}:{sort:"",dir:""}),setSort:o}}function f({label:r,k:e,state:n,onToggle:o,className:c="",align:s="left"}){if(!e)return t.jsx("th",{className:c,children:r});const a=n.sort===e,d=s==="right"?"justify-end":s==="center"?"justify-center":"justify-start";return t.jsx("th",{className:c,children:t.jsxs("button",{type:"button",onClick:()=>o(e),className:`inline-flex w-full items-center gap-1 ${d} hover:text-slate-700`,children:[t.jsx("span",{children:r}),a?n.dir==="asc"?t.jsx(x,{className:"h-3.5 w-3.5 text-brand-600"}):t.jsx(u,{className:"h-3.5 w-3.5 text-brand-600"}):t.jsx(l,{className:"h-3.5 w-3.5 text-slate-300"})]})})}export{f as S,j as u};
