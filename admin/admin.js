/* QCare admin dashboard. All data access is enforced by the database (RLS + admin functions);
   this page is only a client for it. */
(function(){
"use strict";
/* Clickjacking guard: GitHub Pages cannot send frame-ancestors / X-Frame-Options headers. */
if(window.top!==window.self){document.documentElement.style.display="none";try{window.top.location=window.self.location.href}catch(e){}return}
var C=window.QCARE||{};
var $=function(s,r){return (r||document).querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var inr=function(n){return "₹"+Math.round(+n||0).toLocaleString("en-IN")};
var dt=function(s){return s?new Date(s).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"}):""};
var slugOf=function(n){return String(n).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")};
var num=function(v,d){var n=parseInt(v,10);return isNaN(n)?d:n};
var app=$("#app"),dlg=$("#dlg"),dlgb=$("#dlgb"),tt=0;
var STL={pending_payment:"Awaiting payment",paid:"Paid",processing:"Processing",shipped:"Shipped",delivered:"Delivered",cancelled:"Cancelled",returned:"Returned (RTO)",refunded:"Refunded"};
var ENQ={new:"New",in_progress:"In progress",quoted:"Quoted",closed:"Closed"};

function toast(t,bad){var e=$("#toast");e.textContent=t;e.className="on"+(bad?" bad":"");clearTimeout(tt);tt=setTimeout(function(){e.className=""},bad?6000:2500)}
function friendly(e){var m=(e&&e.message)||String(e),k=m.split(":")[0];
  var M={PAYMENT_REF_REQUIRED:"Enter the UPI transaction ID (UTR) from your bank / UPI app first.",COURIER_REQUIRED:"Enter the courier name first.",
    OUT_OF_STOCK:"Not enough stock for "+m.slice(13)+". Correct the stock or cancel the order.",BAD_TRANSITION:"That change isn’t allowed from the order’s current status.",
    FORBIDDEN:"Your account doesn’t have permission for that.",NOT_FOUND:"Not found. Refresh and try again."};
  if(/row-level security|permission denied/i.test(m))return "Your account doesn’t have permission for that (owner only).";
  if(/duplicate key/i.test(m))return "That already exists (duplicate code, slug or SKU).";
  if(/check constraint/i.test(m))return "One of the values isn’t allowed. Check numbers, colours and text length.";
  return M[k]||m}
function fail(e){toast(friendly(e),true)}
function un(r){if(r.error)throw r.error;return r.data}
function badge(s,map){return '<span class="st '+esc(s)+'">'+esc((map||STL)[s]||s)+"</span>"}
function modal(html){dlgb.innerHTML=html;if(!dlg.open)dlg.showModal()}
function closeModal(){if(dlg.open)dlg.close()}
function wa(phone,text){return "https://wa.me/91"+String(phone).replace(/\D/g,"").slice(-10)+"?text="+encodeURIComponent(text)}
function download(name,type,text){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},2000)}
function csvCell(v){v=String(v==null?"":v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}

if(!C.supabaseUrl||!C.supabaseKey||!window.supabase){
  app.innerHTML='<div class="login"><h1>QCare Admin</h1><p>The backend isn’t connected yet. Add your Supabase URL and publishable key to <code>js/config.js</code> (see README, step 3).</p></div>';return}
var sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"qc_admin_auth"}});
var role=null,tab="overview",V=null,range="30",oq={status:"",text:""},idle=0;

/* ---------------- sign in ---------------- */
function login(note){role=null;
  app.innerHTML='<form class="login" id="lf"><h1>QCare Admin</h1><label>Email<input type="email" name="e" required autocomplete="username"></label><label>Password<input type="password" name="p" required autocomplete="current-password"></label><button class="btn">Sign in</button><p class="er" id="le">'+esc(note||"")+"</p></form>";
  $("#lf").addEventListener("submit",function(ev){ev.preventDefault();var f=ev.target;$("#le").textContent="";
    sb.auth.signInWithPassword({email:f.e.value.trim(),password:f.p.value}).then(function(r){if(r.error)$("#le").textContent="Sign-in failed. Check your email and password.";else enter()})})}
function enter(){sb.rpc("admin_whoami").then(un).then(function(r){
    if(!r)return sb.auth.signOut().then(function(){login("This account is not a QCare admin.")});
    role=r;shell()}).catch(function(e){login(friendly(e))})}
function signOut(note){sb.auth.signOut().then(function(){closeModal();login(note)})}
function bump(){clearTimeout(idle);idle=setTimeout(function(){if(role)signOut("Signed out after 30 minutes without activity.")},30*60*1000)}
["click","keydown"].forEach(function(n){addEventListener(n,bump)});

function shell(){bump();
  var tabs=[["overview","Overview"],["orders","Orders"],["products","Products & stock"],["enquiries","Enquiries"]];
  if(role==="owner")tabs.push(["coupons","Coupons"],["settings","Settings"]);
  app.innerHTML='<div class="top"><h1>QCare Admin</h1><div class="tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" data-act="tab" data-t="'+t[0]+'">'+t[1]+"</button>"}).join("")+'</div><span class="mut sm">'+esc(role)+'</span><button class="btn o s" data-act="out">Sign out</button></div><main id="v"></main>';
  V=$("#v");go(tab)}
function go(t){tab=t;document.querySelectorAll(".tabs button").forEach(function(b){b.setAttribute("aria-selected",b.dataset.t===t)});VIEW[t]()}

var VIEW={},ACT={};
ACT.tab=function(el){go(el.dataset.t)};
ACT.out=function(){signOut()};
ACT.close=function(){closeModal()};

/* ---------------- overview ---------------- */
VIEW.overview=function(){
  var from=null;if(range==="1"){var d=new Date();d.setHours(0,0,0,0);from=d.toISOString()}else if(range!=="all")from=new Date(Date.now()-(+range)*864e5).toISOString();
  V.innerHTML='<div class="bar"><h2>Overview</h2><select data-chg="range">'+[["1","Today"],["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All time"]].map(function(o){return '<option value="'+o[0]+'"'+(o[0]===range?" selected":"")+">"+o[1]+"</option>"}).join("")+'</select></div><div id="ov" class="mut">Loading…</div>';
  sb.rpc("admin_stats",{p_from:from}).then(un).then(function(s){var b=s.by_status||{},n=function(k){return b[k]||0};
    var kp=function(v,l){return '<div class="kp"><b>'+v+"</b><span>"+l+"</span></div>"};
    $("#ov").className="";$("#ov").innerHTML='<div class="cards">'+
      kp(inr(s.received),"Payments received")+kp(inr(s.awaiting_payment),"Awaiting payment ("+n("pending_payment")+")")+kp(s.orders,"Orders placed")+
      kp(n("paid")+n("processing"),"To pack and ship")+kp(n("shipped"),"In transit")+kp(n("delivered"),"Delivered")+
      kp(n("cancelled"),"Cancelled")+kp(n("returned"),"Returned (RTO)")+kp(inr(s.refunded),"Refunded ("+n("refunded")+")")+
      kp(s.customers,"Customers ("+s.repeat_customers+" repeat, all time)")+kp(inr(s.shipping_charged),"Shipping charged")+kp(inr(s.discounts),"Coupon discounts given")+
      kp(s.costs_missing?"—":inr(s.goods_margin-s.discounts),s.costs_missing?"Margin: add making cost for every variant in Products":"Goods margin (sales − making cost − discounts; excludes courier, packaging, other expenses)")+
      kp(s.new_enquiries,"New enquiries")+"</div>"+
      '<div class="grid2"><div class="box"><h3>Best sellers (paid orders)</h3>'+(s.top.length?"<table><tr><th>Product</th><th class=r>Qty</th><th class=r>Sales</th></tr>"+s.top.map(function(t){return "<tr><td>"+esc(t.name)+" ("+esc(t.label)+')</td><td class="r">'+t.qty+'</td><td class="r">'+inr(t.amount)+"</td></tr>"}).join("")+"</table>":'<p class="mut">No paid orders in this period.</p>')+
      '</div><div class="box"><h3>Low stock</h3>'+(s.low_stock.length?"<table><tr><th>Product</th><th class=r>Left</th></tr>"+s.low_stock.map(function(t){return "<tr><td>"+esc(t.name)+" ("+esc(t.label)+')</td><td class="r">'+t.stock+"</td></tr>"}).join("")+"</table>":'<p class="mut">Nothing low. Stock is only tracked for variants where you have set a quantity.</p>')+"</div></div>";
  }).catch(fail)};

/* ---------------- orders ---------------- */
VIEW.orders=function(){
  V.innerHTML='<div class="bar"><h2>Orders</h2><input type="search" placeholder="Order no, name or mobile" value="'+esc(oq.text)+'" data-chg="otext"><select data-chg="ostatus"><option value="">All statuses</option>'+Object.keys(STL).map(function(k){return '<option value="'+k+'"'+(oq.status===k?" selected":"")+">"+STL[k]+"</option>"}).join("")+'</select><button class="btn o" data-act="csv">Export CSV</button></div><div class="box" id="ol"><p class="mut">Loading…</p></div>';
  loadOrders()};
function orderQuery(cols,limit){var q=sb.from("orders").select(cols).order("created_at",{ascending:false}).limit(limit);
  if(oq.status)q=q.eq("status",oq.status);
  var t=oq.text.replace(/[^A-Za-z0-9 ]/g,"").trim();if(t)q=q.or("order_no.ilike.%"+t+"%,name.ilike.%"+t+"%,phone.ilike.%"+t+"%");return q}
function loadOrders(){orderQuery("id,order_no,created_at,name,phone,city,pin,total,status",200).then(un).then(function(rows){
  var el=$("#ol");if(!el)return;
  el.innerHTML=rows.length?"<table><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Mobile</th><th>City</th><th class=r>Total</th><th>Status</th></tr>"+rows.map(function(o){return '<tr class="go" data-act="order" data-id="'+o.id+'"><td><b>'+esc(o.order_no)+'</b></td><td class="nw">'+dt(o.created_at)+"</td><td>"+esc(o.name)+"</td><td>"+esc(o.phone)+"</td><td>"+esc(o.city)+" "+esc(o.pin)+'</td><td class="r">'+inr(o.total)+"</td><td>"+badge(o.status)+"</td></tr>"}).join("")+"</table>"+(rows.length===200?'<p class="mut sm">Showing the latest 200. Use search or a status filter to narrow down.</p>':""):'<p class="mut">No orders match.</p>'}).catch(fail)}
ACT.order=function(el){openOrder(+el.dataset.id)};
function openOrder(id){Promise.all([sb.from("orders").select("*").eq("id",id).single(),sb.from("order_items").select("*").eq("order_id",id).order("id"),sb.from("order_events").select("*").eq("order_id",id).order("id")]).then(function(r){
  var o=un(r[0]),items=un(r[1]),ev=un(r[2]),s=o.status;
  var addr=[o.addr_line1,o.addr_line2,o.city,o.state].filter(Boolean).join(", ")+" - "+o.pin;
  var payMsg="Hi "+o.name+", thank you for your QCare order "+o.order_no+".\nAmount to pay: "+inr(o.total)+"\nPlease pay using the QR code below, then reply here with the UPI transaction ID (UTR).";
  var shipMsg="Hi "+o.name+", your QCare order "+o.order_no+" has been shipped"+(o.courier?" via "+o.courier:"")+(o.awb?". Tracking number: "+o.awb:"")+". Thank you!";
  var b=function(st,label,cls){return '<button class="btn '+(cls||"o")+'" data-act="setst" data-id="'+o.id+'" data-s="'+st+'">'+label+"</button>"};
  var acts="";
  if(s==="pending_payment")acts='<a class="btn o" target="_blank" rel="noopener" href="'+esc(wa(o.phone,payMsg))+'">WhatsApp: request payment</a><label>UPI transaction ID (UTR)<input id="a_ref" maxlength="60" autocomplete="off"></label>'+b("paid","Mark paid","")+b("cancelled","Cancel order","d");
  if(s==="paid"||s==="processing")acts=(s==="paid"?b("processing","Mark processing"):"")+'<label>Courier<input id="a_courier" maxlength="60"></label><label>Tracking / AWB no.<input id="a_awb" maxlength="60"></label>'+b("shipped","Mark shipped","")+b("cancelled","Cancel (restores stock)","d")+b("refunded","Mark refunded","d");
  if(s==="shipped")acts='<a class="btn o" target="_blank" rel="noopener" href="'+esc(wa(o.phone,shipMsg))+'">WhatsApp: send tracking</a>'+b("delivered","Mark delivered","")+b("returned","Returned to us (RTO)","d");
  if(s==="delivered"||s==="returned"||(s==="cancelled"&&o.paid_at))acts=b("refunded","Mark refunded","d");
  modal('<div class="dh"><h2>'+esc(o.order_no)+" "+badge(s)+'</h2><button class="btn o s" data-act="close">Close</button></div>'+
    '<div class="grid2"><div><h3>Customer</h3><p>'+esc(o.name)+'<br><a target="_blank" rel="noopener" href="'+esc(wa(o.phone,"Hi "+o.name+", this is QCare Candles about your order "+o.order_no+"."))+'">'+esc(o.phone)+"</a>"+(o.email?"<br>"+esc(o.email):"")+'</p><h3>Deliver to</h3><p id="a_addr">'+esc(o.name)+"<br>"+esc(addr)+"<br>Ph: "+esc(o.phone)+'</p><button class="btn o s" data-act="copyaddr">Copy address</button>'+(o.note?"<h3 style='margin-top:12px'>Personalisation</h3><p>"+esc(o.note)+"</p>":"")+
    "</div><div><h3>Payment</h3><p>"+(o.paid_at?"Paid "+dt(o.paid_at)+"<br>UTR: "+esc(o.payment_ref):"Not paid yet. Confirm the credit in your bank / UPI app before marking paid. A screenshot is not proof.")+"</p>"+(o.courier?"<h3>Shipment</h3><p>"+esc(o.courier)+(o.awb?" · "+esc(o.awb):"")+"<br>Shipped "+dt(o.shipped_at)+(o.delivered_at?"<br>Delivered "+dt(o.delivered_at):"")+"</p>":"")+"</div></div>"+
    "<table><tr><th>Item</th><th class=r>Price</th><th class=r>Qty</th><th class=r>Total</th></tr>"+items.map(function(i){return "<tr><td>"+esc(i.product_name)+" ("+esc(i.variant_label)+')</td><td class="r">'+inr(i.unit_price)+'</td><td class="r">'+i.qty+'</td><td class="r">'+inr(i.line_total)+"</td></tr>"}).join("")+
    '<tr><td colspan="3" class="r">Subtotal</td><td class="r">'+inr(o.subtotal)+"</td></tr>"+(o.discount?'<tr><td colspan="3" class="r">Coupon '+esc(o.coupon_code)+'</td><td class="r">−'+inr(o.discount)+"</td></tr>":"")+'<tr><td colspan="3" class="r">Shipping</td><td class="r">'+inr(o.shipping)+'</td></tr><tr><td colspan="3" class="r"><b>Total</b>'+(+o.gst_included?' <span class="mut sm">(incl. GST '+inr(o.gst_included)+")</span>":"")+'</td><td class="r"><b>'+inr(o.total)+"</b></td></tr></table>"+
    (acts?'<div class="acts">'+acts+'<label style="flex:1;min-width:160px">Note for the log (optional)<input id="a_note" maxlength="300"></label></div>':"")+
    '<div><h3>History</h3><table>'+ev.map(function(e){return '<tr><td class="nw">'+dt(e.created_at)+"</td><td>"+esc(STL[e.to_status]||e.to_status)+"</td><td>"+esc(e.note)+'</td><td class="mut sm">'+(e.actor?"admin":"website")+"</td></tr>"}).join("")+"</table></div>");
  }).catch(fail)}
ACT.copyaddr=function(el){navigator.clipboard.writeText($("#a_addr").innerText).then(function(){toast("Address copied")})};
ACT.setst=function(el){var s=el.dataset.s,id=+el.dataset.id,g=function(i){var e=$("#"+i);return e?e.value.trim():null};
  if((s==="cancelled"||s==="refunded"||s==="returned")&&!confirm("Mark this order as "+STL[s]+"? This can’t be undone."))return;
  if(s==="refunded"&&!confirm("Have you already sent the refund from your bank / UPI app? This only records it."))return;
  el.disabled=true;
  sb.rpc("admin_set_status",{p_order_id:id,p_status:s,p_payment_ref:g("a_ref"),p_courier:g("a_courier"),p_awb:g("a_awb"),p_note:g("a_note")}).then(un).then(function(){toast("Order updated");openOrder(id);if(tab==="orders")loadOrders()}).catch(function(e){el.disabled=false;fail(e)})};
ACT.csv=function(){orderQuery("*,order_items(product_name,variant_label,qty,unit_price)",1000).then(un).then(function(rows){
  var cols=["order_no","created_at","status","name","phone","email","addr_line1","addr_line2","city","state","pin","subtotal","discount","coupon_code","shipping","total","gst_included","payment_ref","paid_at","courier","awb","shipped_at","delivered_at","note"];
  var out=[cols.concat(["items"]).map(csvCell).join(",")].concat(rows.map(function(o){return cols.map(function(c){return csvCell(o[c])}).concat([csvCell((o.order_items||[]).map(function(i){return i.product_name+" ("+i.variant_label+") x"+i.qty}).join("; "))]).join(",")}));
  download("qcare-orders-"+new Date().toISOString().slice(0,10)+".csv","text/csv","﻿"+out.join("\r\n"))}).catch(fail)};

/* ---------------- products & stock ---------------- */
var PR=[];
VIEW.products=function(){
  V.innerHTML='<div class="bar"><h2>Products & stock</h2><button class="btn o" data-act="moves">Stock history</button><button class="btn" data-act="pnew">Add product</button></div><div class="box" id="pl"><p class="mut">Loading…</p></div><p class="mut sm">Changes appear on the website on the next page load. Stock “not tracked” means the item is always shown as available.</p>';
  loadProducts()};
function loadProducts(then){sb.from("products").select("*,variants(*)").order("sort_order").order("id").then(un).then(function(rows){PR=rows;rows.forEach(function(p){p.variants.sort(function(a,b){return a.sort_order-b.sort_order||a.id-b.id})});
  var el=$("#pl");if(el)el.innerHTML=rows.length?"<table><tr><th></th><th>Product</th><th>Variants: price · stock</th><th>On site</th><th></th></tr>"+rows.map(function(p){return "<tr><td>"+(p.image_url?'<img class="th" alt="" src="'+esc(imgSrc(p.image_url))+'">':'<span class="th sw" style="background:'+esc(p.color)+'"></span>')+"</td><td><b>"+esc(p.name)+"</b>"+(p.tag?' <span class="st">'+esc(p.tag)+"</span>":"")+'<br><span class="mut sm">'+esc(p.slug)+"</span></td><td>"+(p.variants.map(function(v){return esc(v.label)+" "+inr(v.price)+" · "+(v.stock==null?'<span class="mut">not tracked</span>':v.stock+" left")+(v.active?"":' <span class="mut">(off)</span>')}).join("<br>")||'<span class="er">No variants: not shown on site</span>')+"</td><td>"+(p.active?"Yes":'<span class="mut">Hidden</span>')+'</td><td class="r"><button class="btn o s" data-act="pedit" data-id="'+p.id+'">Edit</button></td></tr>'}).join("")+"</table>":'<p class="mut">No products yet.</p>';
  if(then)then()}).catch(fail)}
function imgSrc(u){return /^https:\/\//.test(u)?u:"../"+u}
ACT.pnew=function(){editProduct(null)};
ACT.pedit=function(el){editProduct(+el.dataset.id)};
function editProduct(id){var p=id?PR.filter(function(x){return x.id===id})[0]:{name:"",slug:"",tag:"",description:"",color:"#D9C79A",accent:"#3A2A22",image_url:"",active:true,sort_order:(PR.length+1),variants:[]};
  if(!p)return;
  modal('<div class="dh"><h2>'+(id?esc(p.name):"New product")+'</h2><button class="btn o s" data-act="close">Close</button></div>'+
  '<form id="pf" class="grid2" data-id="'+(id||"")+'"><label>Name<input name="name" required maxlength="60" value="'+esc(p.name)+'"></label><label>Tag (e.g. Best Seller)<input name="tag" maxlength="24" value="'+esc(p.tag)+'"></label>'+
  '<label style="grid-column:1/-1">Description (shown in product details)<textarea name="description" rows="2" maxlength="600">'+esc(p.description)+"</textarea></label>"+
  '<label>Wax colour<input type="color" name="color" value="'+esc(p.color)+'"></label><label>Label accent colour<input type="color" name="accent" value="'+esc(p.accent)+'"></label>'+
  '<label>Sort order<input type="number" name="sort_order" value="'+p.sort_order+'"></label><label class="ck"><input type="checkbox" name="active"'+(p.active?" checked":"")+"> Show on website</label>"+
  '<label style="grid-column:1/-1">Round label image (WebP, JPG or PNG, square, under 1 MB)<input type="file" name="img" accept="image/webp,image/jpeg,image/png"></label><input type="hidden" name="image_url" value="'+esc(p.image_url)+'">'+
  '<div class="row" style="grid-column:1/-1"><button class="btn">'+(id?"Save product":"Create product")+"</button>"+(id?'<button type="button" class="btn d" data-act="pdel" data-id="'+id+'">Delete</button>':"")+"</div></form>"+
  (id?'<div><h3>Variants</h3><p class="mut sm">Price is what the customer pays. Making cost is private and only used for margin reports. Weight is the packed parcel weight per candle, used for shipping.</p><table class="vr"><tr><th>Label</th><th>Price ₹</th><th>Making cost ₹</th><th>Packed weight g</th><th>On</th><th>Stock</th><th></th></tr>'+
    p.variants.map(function(v){return '<tr data-vid="'+v.id+'"><td><input name="label" maxlength="40" value="'+esc(v.label)+'"></td><td><input name="price" type="number" min="1" value="'+v.price+'"></td><td><input name="cost" type="number" min="0" value="'+v.cost+'"></td><td><input name="weight_g" type="number" min="1" value="'+v.weight_g+'"></td><td><input name="active" type="checkbox"'+(v.active?" checked":"")+'></td><td class="nw">'+(v.stock==null?"not tracked":v.stock)+' <button class="btn o s" data-act="stock" data-sku="'+esc(v.sku)+'" data-pid="'+id+'" data-cur="'+(v.stock==null?"":v.stock)+'">Set</button></td><td><button class="btn s" data-act="vsave" data-pid="'+id+'">Save</button></td></tr>'}).join("")+
    '<tr id="vn"><td><input name="label" maxlength="40" placeholder="e.g. Premium"></td><td><input name="price" type="number" min="1"></td><td><input name="cost" type="number" min="0" value="0"></td><td><input name="weight_g" type="number" min="1" value="100"></td><td></td><td></td><td><button class="btn o s" data-act="vadd" data-pid="'+id+'">Add</button></td></tr></table></div>':'<p class="mut sm">Create the product first, then add its variants (e.g. Normal, Premium) with prices.</p>'));
  $("#pf").addEventListener("submit",function(ev){ev.preventDefault();saveProduct(ev.target)})}
function saveProduct(f){var id=+f.dataset.id||null,file=f.img.files[0];
  var row={name:f.name.value.trim(),tag:f.tag.value.trim(),description:f.description.value.trim(),color:f.color.value,accent:f.accent.value,sort_order:num(f.sort_order.value,0),active:f.active.checked,image_url:f.image_url.value};
  var slug=id?PR.filter(function(x){return x.id===id})[0].slug:slugOf(row.name);
  if(!slug)return toast("Enter a product name using letters or numbers.",true);
  var up=Promise.resolve();
  if(file){if(!/^image\/(webp|jpeg|png)$/.test(file.type)||file.size>1048576)return toast("Image must be WebP, JPG or PNG and under 1 MB.",true);
    var path=slug+"-"+Date.now()+"."+file.type.split("/")[1].replace("jpeg","jpg");
    up=sb.storage.from("product-images").upload(path,file,{contentType:file.type,cacheControl:"31536000"}).then(un).then(function(){row.image_url=sb.storage.from("product-images").getPublicUrl(path).data.publicUrl})}
  up.then(function(){if(id)return sb.from("products").update(row).eq("id",id).select("id").single();row.slug=slug;return sb.from("products").insert(row).select("id").single()})
    .then(un).then(function(r){toast("Product saved");loadProducts(function(){editProduct(r.id)})}).catch(fail)}
ACT.pdel=function(el){if(!confirm("Delete this product and its variants? Past orders keep their own copy. To hide it temporarily, untick “Show on website” instead."))return;
  sb.from("products").delete().eq("id",+el.dataset.id).then(un).then(function(){toast("Product deleted");closeModal();loadProducts()}).catch(fail)};
function vrow(tr){var g=function(n){return $('[name="'+n+'"]',tr)};return {label:g("label").value.trim(),price:num(g("price").value,0),cost:num(g("cost").value,0),weight_g:num(g("weight_g").value,100)}}
ACT.vsave=function(el){var tr=el.closest("tr"),row=vrow(tr);row.active=$('[name="active"]',tr).checked;
  sb.from("variants").update(row).eq("id",+tr.dataset.vid).then(un).then(function(){toast("Variant saved");loadProducts()}).catch(fail)};
ACT.vadd=function(el){var pid=+el.dataset.pid,p=PR.filter(function(x){return x.id===pid})[0],row=vrow($("#vn"));
  if(!row.label||row.price<1)return toast("Enter a label and a price.",true);
  row.product_id=pid;row.sku=p.slug+"-"+slugOf(row.label);row.sort_order=p.variants.length+1;
  sb.from("variants").insert(row).then(un).then(function(){toast("Variant added");loadProducts(function(){editProduct(pid)})}).catch(fail)};
ACT.stock=function(el){var v=prompt("Stock on hand for "+el.dataset.sku+".\nLeave empty to stop tracking stock for this item.",el.dataset.cur);if(v===null)return;
  v=v.trim();if(v!==""&&!/^\d{1,6}$/.test(v))return toast("Enter a whole number.",true);
  var why=prompt("Reason (kept in the stock history)","Stock count");if(why===null)return;
  sb.rpc("admin_adjust_stock",{p_sku:el.dataset.sku,p_stock:v===""?null:+v,p_reason:why}).then(un).then(function(){toast("Stock updated");loadProducts(function(){editProduct(+el.dataset.pid)})}).catch(fail)};
ACT.moves=function(){sb.from("stock_moves").select("*").order("id",{ascending:false}).limit(150).then(un).then(function(rows){
  modal('<div class="dh"><h2>Stock history</h2><button class="btn o s" data-act="close">Close</button></div>'+(rows.length?"<table><tr><th>When</th><th>SKU</th><th class=r>Change</th><th class=r>After</th><th>Reason</th></tr>"+rows.map(function(m){return '<tr><td class="nw">'+dt(m.created_at)+"</td><td>"+esc(m.sku)+'</td><td class="r">'+(m.delta==null?"set":(m.delta>0?"+":"")+m.delta)+'</td><td class="r">'+(m.stock_after==null?"not tracked":m.stock_after)+"</td><td>"+esc(m.reason)+"</td></tr>"}).join("")+"</table>":'<p class="mut">No stock changes yet.</p>'))}).catch(fail)};

/* ---------------- enquiries ---------------- */
var EN=[];
VIEW.enquiries=function(){V.innerHTML='<div class="bar"><h2>Enquiries</h2></div><div class="box" id="el"><p class="mut">Loading…</p></div>';
  sb.from("enquiries").select("*").order("created_at",{ascending:false}).limit(200).then(un).then(function(rows){EN=rows;
    $("#el").innerHTML=rows.length?"<table><tr><th>Received</th><th>Type</th><th>Name</th><th>Mobile</th><th>Summary</th><th>Status</th></tr>"+rows.map(function(e){var d=e.details||{};return '<tr class="go" data-act="enq" data-id="'+e.id+'"><td class="nw">'+dt(e.created_at)+"</td><td>"+esc(e.kind)+"</td><td>"+esc(e.name)+"</td><td>"+esc(e.phone)+"</td><td>"+esc(String(d.message||[d.occasion,d.fragrance,d.quantity?"qty "+d.quantity:""].filter(Boolean).join(" · ")).slice(0,70))+"</td><td>"+badge(e.status,ENQ)+"</td></tr>"}).join("")+"</table>":'<p class="mut">No enquiries yet.</p>'}).catch(fail)};
ACT.enq=function(el){var e=EN.filter(function(x){return x.id===+el.dataset.id})[0],d=e.details||{};
  modal('<div class="dh"><h2>'+esc(e.kind)+" enquiry · "+esc(e.name)+'</h2><button class="btn o s" data-act="close">Close</button></div><p class="mut sm">'+dt(e.created_at)+(e.email?" · "+esc(e.email):"")+"</p><table>"+Object.keys(d).map(function(k){return "<tr><th>"+esc(k.replace(/_/g," "))+"</th><td><pre>"+esc(d[k])+"</pre></td></tr>"}).join("")+"</table>"+
  '<form id="ef" class="row" data-id="'+e.id+'"><label>Status<select name="status">'+Object.keys(ENQ).map(function(k){return '<option value="'+k+'"'+(e.status===k?" selected":"")+">"+ENQ[k]+"</option>"}).join("")+'</select></label><label style="flex:1;min-width:200px">Your notes (quote given, follow-up date…)<input name="admin_note" maxlength="500" value="'+esc(e.admin_note)+'"></label><button class="btn">Save</button>'+(e.phone?'<a class="btn o" target="_blank" rel="noopener" href="'+esc(wa(e.phone,"Hi "+e.name+", this is QCare Candles about your "+e.kind+" enquiry."))+'">WhatsApp</a>':"")+"</form>");
  $("#ef").addEventListener("submit",function(ev){ev.preventDefault();var f=ev.target;sb.from("enquiries").update({status:f.status.value,admin_note:f.admin_note.value.trim()}).eq("id",+f.dataset.id).then(un).then(function(){toast("Saved");closeModal();VIEW.enquiries()}).catch(fail)})};

/* ---------------- coupons (owner) ---------------- */
VIEW.coupons=function(){V.innerHTML='<div class="bar"><h2>Coupons</h2></div><div class="box"><form id="cf" class="row"><label>Code<input name="code" required pattern="[A-Za-z0-9]{3,20}" maxlength="20" style="text-transform:uppercase"></label><label>% off<input name="percent_off" type="number" min="1" max="90" required style="width:80px"></label><label>Min order ₹<input name="min_order" type="number" min="0" value="0" style="width:100px"></label><label>Max uses (blank = unlimited)<input name="max_uses" type="number" min="1" style="width:100px"></label><label>Expires (optional)<input name="expires_at" type="date"></label><button class="btn">Add coupon</button></form></div><div class="box" id="cl"><p class="mut">Loading…</p></div><p class="mut sm">A use is counted when you mark the order paid.</p>';
  $("#cf").addEventListener("submit",function(ev){ev.preventDefault();var f=ev.target;
    sb.from("coupons").insert({code:f.code.value.trim().toUpperCase(),percent_off:num(f.percent_off.value,0),min_order:num(f.min_order.value,0),max_uses:f.max_uses.value?num(f.max_uses.value,null):null,expires_at:f.expires_at.value?new Date(f.expires_at.value+"T23:59:59").toISOString():null}).then(un).then(function(){toast("Coupon added");VIEW.coupons()}).catch(fail)});
  sb.from("coupons").select("*").order("code").then(un).then(function(rows){$("#cl").innerHTML=rows.length?"<table><tr><th>Code</th><th class=r>% off</th><th class=r>Min order</th><th class=r>Used</th><th>Expires</th><th>Active</th><th></th></tr>"+rows.map(function(c){return "<tr><td><b>"+esc(c.code)+'</b></td><td class="r">'+c.percent_off+'</td><td class="r">'+inr(c.min_order)+'</td><td class="r">'+c.used_count+(c.max_uses?" / "+c.max_uses:"")+"</td><td>"+(c.expires_at?dt(c.expires_at):"—")+'</td><td><input type="checkbox" data-chg="cact" data-code="'+esc(c.code)+'"'+(c.active?" checked":"")+'></td><td class="r"><button class="btn d s" data-act="cdel" data-code="'+esc(c.code)+'">Delete</button></td></tr>'}).join("")+"</table>":'<p class="mut">No coupons.</p>'}).catch(fail)};
ACT.cdel=function(el){if(confirm("Delete coupon "+el.dataset.code+"?"))sb.from("coupons").delete().eq("code",el.dataset.code).then(un).then(function(){VIEW.coupons()}).catch(fail)};

/* ---------------- settings (owner) ---------------- */
VIEW.settings=function(){sb.from("settings").select("*").single().then(un).then(function(s){
  var n=function(k,l,x){return "<label>"+l+'<input type="number" min="0" name="'+k+'" value="'+esc(s[k])+'"'+(x||"")+"></label>"};
  V.innerHTML='<div class="bar"><h2>Settings</h2></div><form id="sf"><div class="box"><h3>Orders</h3><p><label class="ck"><input type="checkbox" name="accepting_orders"'+(s.accepting_orders?" checked":"")+'> Accept orders on the website</label></p><h3>Shipping charges</h3><p class="mut sm">Flat rates you charge the customer. “Nearby” means the PIN starts with the same digit as your home PIN. Extra slab is added for each further block of weight.</p><div class="grid4">'+
    n("ship_near","Nearby ₹")+n("ship_far","Rest of India ₹")+n("ship_slab","Each extra slab ₹")+n("slab_g","Slab size (grams)",' min="1"')+n("free_over","Free shipping from ₹ (0 = never)")+'<label>Home PIN<input name="home_pin" pattern="[1-9][0-9]{5}" maxlength="6" value="'+esc(s.home_pin)+'"></label>'+n("low_stock","Low-stock alert at")+
    '</div></div><div class="box"><h3>GST</h3><p class="mut sm">Leave OFF until your GSTIN is issued. When ON, the site shows “GST included” and the tax portion of each order is recorded. Have your accountant confirm the rate.</p><div class="grid3"><label class="ck"><input type="checkbox" name="gst_enabled"'+(s.gst_enabled?" checked":"")+'> Prices include GST</label><label>GST rate %<input type="number" step="0.01" min="0" max="28" name="gst_rate" value="'+esc(s.gst_rate)+'"></label><label>GSTIN<input name="gstin" maxlength="15" value="'+esc(s.gstin)+'"></label></div></div><button class="btn">Save settings</button></form>'+
    '<div class="box" style="margin-top:16px"><h3>Backup</h3><p class="mut sm">The free Supabase plan keeps no backups for you. Download this file every week and keep it somewhere safe. It contains customer names, phones and addresses, so store it privately.</p><button class="btn o" data-act="backup">Download full backup (JSON)</button></div>';
  $("#sf").addEventListener("submit",function(ev){ev.preventDefault();var f=ev.target,row={accepting_orders:f.accepting_orders.checked,gst_enabled:f.gst_enabled.checked,gst_rate:parseFloat(f.gst_rate.value)||0,gstin:f.gstin.value.trim().toUpperCase(),home_pin:f.home_pin.value.trim()};
    ["ship_near","ship_far","ship_slab","slab_g","free_over","low_stock"].forEach(function(k){row[k]=num(f[k].value,0)});
    if(row.gst_enabled&&!/^[0-9A-Z]{15}$/.test(row.gstin))return toast("Enter your 15-character GSTIN before switching GST on.",true);
    sb.from("settings").update(row).eq("id",true).select("id").then(un).then(function(r){if(!r.length)throw new Error("permission denied");toast("Settings saved")}).catch(fail)})}).catch(fail)};
ACT.backup=function(){var T=["settings","products","variants","coupons","orders","order_items","order_events","stock_moves","enquiries"];
  Promise.all(T.map(function(t){return sb.from(t).select("*").limit(50000).then(un)})).then(function(r){var o={exported_at:new Date().toISOString()};T.forEach(function(t,i){o[t]=r[i]});download("qcare-backup-"+o.exported_at.slice(0,10)+".json","application/json",JSON.stringify(o,null,1))}).catch(fail)};

/* ---------------- events ---------------- */
document.addEventListener("click",function(e){var el=e.target.closest("[data-act]");if(el&&ACT[el.dataset.act]){if(el.tagName==="BUTTON"&&el.type==="submit"&&!el.form)e.preventDefault();ACT[el.dataset.act](el,e)}});
var st=0;
document.addEventListener("input",function(e){var k=e.target.dataset.chg;if(k==="otext"){oq.text=e.target.value;clearTimeout(st);st=setTimeout(loadOrders,300)}});
document.addEventListener("change",function(e){var el=e.target,k=el.dataset.chg;
  if(k==="range"){range=el.value;VIEW.overview()}
  if(k==="ostatus"){oq.status=el.value;loadOrders()}
  if(k==="cact")sb.from("coupons").update({active:el.checked}).eq("code",el.dataset.code).select("code").then(un).then(function(r){if(!r.length)throw new Error("permission denied");toast("Saved")}).catch(function(x){el.checked=!el.checked;fail(x)})});
dlg.addEventListener("click",function(e){if(e.target===dlg)closeModal()});

sb.auth.getSession().then(function(r){if(r.data&&r.data.session)enter();else login()});
})();
