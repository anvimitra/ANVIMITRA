import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight, BadgeCheck, Banknote, BriefcaseBusiness, Calculator,
  Camera, ChevronRight, ClipboardList, FileCheck2, FileText, Headphones,
  Landmark, Menu, MessageCircle, MonitorSmartphone, PenLine, Phone,
  Printer, Search, ShieldCheck, ShoppingBag, Smartphone, Sparkles,
  Ticket, Upload, WalletCards, X
} from "lucide-react";
import "./styles.css";

const PHONE = "919100000000"; // Replace with your real WhatsApp number.
const DISPLAY_PHONE = "+91 91000 00000"; // Replace with your real number.

const services = [
  { id: 1, title: "Online Form Assistance", price: 49, category: "Forms", icon: ClipboardList, desc: "Online applications filled carefully with guidance." },
  { id: 2, title: "Government Service Assistance", price: 99, category: "E-mitra", icon: Landmark, desc: "Digital help for eligible government & E-mitra services." },
  { id: 3, title: "Print / Photocopy", price: 5, category: "Documents", icon: Printer, desc: "Clean black & white or colour document printing." },
  { id: 4, title: "Scan & PDF", price: 30, category: "Documents", icon: FileText, desc: "Scan documents and prepare neat PDF files." },
  { id: 5, title: "Passport Photo Layout", price: 40, category: "Photos", icon: Camera, desc: "Print-ready passport photo sheet preparation." },
  { id: 6, title: "Document Formatting", price: 50, category: "Documents", icon: PenLine, desc: "Formatting, typing and basic document cleanup." },
  { id: 7, title: "Bill Payment Assistance", price: 10, category: "Payments", icon: WalletCards, desc: "Help with supported online bill-payment services." },
  { id: 8, title: "Travel Booking Assistance", price: 50, category: "Booking", icon: Ticket, desc: "Online travel booking assistance and print support." },
  { id: 9, title: "Online Registration", price: 79, category: "Forms", icon: FileCheck2, desc: "Registration assistance for eligible online services." }
];

const categories = ["All", "E-mitra", "Forms", "Documents", "Photos", "Payments", "Booking"];

function App() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => services.filter((item) => {
    const categoryMatch = active === "All" || item.category === active;
    const queryMatch = `${item.title} ${item.desc} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    return categoryMatch && queryMatch;
  }), [active, query]);

  const addToCart = (service) => {
    setCart((items) => {
      const found = items.find((x) => x.id === service.id);
      if (found) return items.map((x) => x.id === service.id ? { ...x, qty: x.qty + 1 } : x);
      return [...items, { ...service, qty: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart((items) => items.filter((x) => x.id !== id));
  };

  const total = cart.reduce((sum, x) => sum + x.price * x.qty, 0);
  const cartCount = cart.reduce((sum, x) => sum + x.qty, 0);

  const checkout = () => {
    if (!cart.length) return;
    const lines = cart.map((x) => `${x.title} × ${x.qty} — ₹${x.price * x.qty}`);
    const message = `Namaste Anvi E-mitra & CSC Centre,%0A%0AI want to enquire about:%0A${lines.join("%0A")}%0A%0AEstimated total: ₹${total}`;
    window.open(`https://wa.me/${PHONE}?text=${message}`, "_blank", "noopener,noreferrer");
  };

  const fadeUp = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, ease: "easeOut" }
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Anvi E-mitra & CSC Centre home">
          <span className="brand-mark">A</span>
          <span>
            <strong>Anvi E-mitra</strong>
            <small>& CSC Centre</small>
          </span>
        </a>

        <nav className={`nav ${mobileNav ? "open" : ""}`} aria-label="Main navigation">
          {["home", "services", "shop", "how-it-works", "contact"].map((id) => (
            <a key={id} href={`#${id}`} onClick={() => setMobileNav(false)}>
              {id === "home" ? "Home" : id === "services" ? "Services" : id === "shop" ? "Shop" : id === "how-it-works" ? "How it works" : "Contact"}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <button className="icon-btn cart-btn" onClick={() => setDrawer(true)} aria-label={`Open cart, ${cartCount} items`}>
            <ShoppingBag size={20} />
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
          <button className="icon-btn menu-btn" onClick={() => setMobileNav((v) => !v)} aria-label="Toggle navigation">
            {mobileNav ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-glow one" />
          <div className="hero-glow two" />
          <div className="container hero-grid">
            <motion.div className="hero-copy" {...fadeUp}>
              <div className="eyebrow"><Sparkles size={15} /> DIGITAL SERVICES • LOCAL SUPPORT</div>
              <h1>Online kaam, <span>simple</span> aur bharose ke saath.</h1>
              <p>Forms, E-mitra services, printing, documents aur digital assistance — sab ek hi jagah.</p>
              <a className="primary-btn hero-cta" href="#shop">Services देखें <ArrowRight size={18} /></a>
              <div className="hero-trust">
                <span><ShieldCheck size={17} /> Secure assistance</span>
                <span><BadgeCheck size={17} /> Clear pricing</span>
              </div>
            </motion.div>

            <motion.div
              className="hero-panel"
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96, y: reduceMotion ? 0 : 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12 }}
            >
              <div className="panel-top">
                <span className="live-dot" /> Digital Service Desk
                <span className="panel-time">OPEN</span>
              </div>
              <div className="panel-title">Aapka digital kaam,<br /><strong>humari priority.</strong></div>
              <div className="mini-services">
                <Mini icon={FileText} text="Forms & Documents" />
                <Mini icon={Landmark} text="E-mitra Assistance" />
                <Mini icon={Printer} text="Print & Scan" />
                <Mini icon={Smartphone} text="Online Services" />
              </div>
              <div className="panel-footer"><Phone size={16} /> {DISPLAY_PHONE}</div>
            </motion.div>
          </div>
        </section>

        <section className="trust-strip">
          <div className="container trust-grid">
            <Trust icon={ShieldCheck} title="Careful handling" text="Your documents are handled responsibly." />
            <Trust icon={Banknote} title="Transparent charges" text="Simple service-wise pricing." />
            <Trust icon={Headphones} title="Local support" text="Help when you need it." />
            <Trust icon={MonitorSmartphone} title="Digital first" text="Fast online assistance." />
          </div>
        </section>

        <section className="section" id="services">
          <div className="container">
            <SectionHead kicker="WHAT WE DO" title="One centre. Many digital services." text="Everyday online and document work, organized so you can find the right help quickly." />
            <div className="service-grid">
              <ServiceCard icon={Landmark} title="E-mitra & Government" text="Eligible digital government service assistance." />
              <ServiceCard icon={ClipboardList} title="Online Applications" text="Forms, registrations and online application support." />
              <ServiceCard icon={Printer} title="Print & Documents" text="Print, scan, photocopy, PDF and formatting." />
              <ServiceCard icon={Camera} title="Photos & Design" text="Passport photos and simple document layouts." />
              <ServiceCard icon={WalletCards} title="Bills & Payments" text="Assistance for supported online payments." />
              <ServiceCard icon={Ticket} title="Travel Assistance" text="Online booking support and print-ready tickets." />
            </div>
          </div>
        </section>

        <section className="section shop-section" id="shop">
          <div className="container">
            <div className="shop-head">
              <SectionHead kicker="DIGITAL SHOP" title="Choose a service." text="Add services to your enquiry list and send the request on WhatsApp." />
              <div className="searchbox">
                <Search size={18} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services..." aria-label="Search services" />
              </div>
            </div>

            <div className="filters" role="tablist" aria-label="Service categories">
              {categories.map((cat) => (
                <button key={cat} className={active === cat ? "filter active" : "filter"} onClick={() => setActive(cat)}>{cat}</button>
              ))}
            </div>

            <div className="product-grid">
              {filtered.map((service, i) => (
                <motion.article
                  key={service.id}
                  className="product-card"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: reduceMotion ? 0 : i * 0.035 }}
                >
                  <div className="product-icon"><service.icon size={22} /></div>
                  <div className="product-category">{service.category}</div>
                  <h3>{service.title}</h3>
                  <p>{service.desc}</p>
                  <div className="product-bottom">
                    <strong>₹{service.price}</strong>
                    <button className="add-btn" onClick={() => addToCart(service)} aria-label={`Add ${service.title} to enquiry`}>
                      Add <span>+</span>
                    </button>
                  </div>
                </motion.article>
              ))}
            </div>

            {!filtered.length && <div className="empty-state">No service found. Try another search.</div>}
          </div>
        </section>

        <section className="section process" id="how-it-works">
          <div className="container">
            <SectionHead kicker="HOW IT WORKS" title="Simple from start to finish." text="No complicated process. Tell us what you need, share only the required information, and we guide you." />
            <div className="steps">
              <Step n="01" icon={Search} title="Choose a service" text="Browse the digital shop and select the work you need." />
              <Step n="02" icon={MessageCircle} title="Send an enquiry" text="Add services to your list and continue on WhatsApp." />
              <Step n="03" icon={Upload} title="Share required details" text="We tell you what documents or information are actually needed." />
              <Step n="04" icon={FileCheck2} title="Get it done" text="Complete the service with clear charges and updates." />
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="container cta-card">
            <div>
              <span className="eyebrow">NEED HELP?</span>
              <h2>Not sure which service you need?</h2>
              <p>WhatsApp us with your requirement and we’ll guide you to the right service.</p>
            </div>
            <a className="secondary-btn" href={`https://wa.me/${PHONE}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp us</a>
          </div>
        </section>

        <section className="section contact-section" id="contact">
          <div className="container contact-grid">
            <div>
              <SectionHead kicker="CONTACT" title="Visit or contact Anvi E-mitra & CSC Centre." text="Replace the placeholder contact details below with your centre's actual details before publishing." />
              <div className="contact-list">
                <Contact icon={Phone} title="Phone / WhatsApp" text={DISPLAY_PHONE} href={`https://wa.me/${PHONE}`} />
                <Contact icon={BriefcaseBusiness} title="Business hours" text="Mon–Sat • 9:00 AM – 7:00 PM" />
                <Contact icon={Landmark} title="Address" text="Your shop address, Kota, Rajasthan" />
              </div>
            </div>
            <div className="contact-card">
              <div className="contact-card-icon"><Calculator size={24} /></div>
              <h3>Quick service enquiry</h3>
              <p>Send us your requirement directly. We can confirm availability, documents required and charges.</p>
              <a className="primary-btn" href={`https://wa.me/${PHONE}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Start WhatsApp chat</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div><strong>Anvi E-mitra & CSC Centre</strong><span>Digital Services • Online Assistance</span></div>
          <span>© 2026 Anvi E-mitra & CSC Centre</span>
        </div>
      </footer>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className="drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }} aria-label="Service enquiry list">
              <div className="drawer-head"><div><span className="eyebrow">YOUR LIST</span><h2>Service enquiry</h2></div><button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close cart"><X size={21} /></button></div>
              {cart.length ? (
                <>
                  <div className="drawer-items">
                    {cart.map((item) => (
                      <div className="drawer-item" key={item.id}>
                        <div><strong>{item.title}</strong><span>₹{item.price} × {item.qty}</span></div>
                        <button onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.title}`}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="drawer-total"><span>Estimated total</span><strong>₹{total}</strong></div>
                  <button className="primary-btn full" onClick={checkout}><MessageCircle size={18} /> Send on WhatsApp</button>
                  <p className="tiny-note">Final charges can vary by service. This list is an enquiry, not an online payment.</p>
                </>
              ) : <div className="empty-cart"><ShoppingBag size={34} /><strong>Your list is empty</strong><span>Add a service to start an enquiry.</span></div>}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" initial={{ y: 16, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: .98 }}>
              <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20} /></button>
              <div className="product-icon"><selected.icon size={22} /></div>
              <span className="product-category">{selected.category}</span>
              <h2>{selected.title}</h2>
              <p>{selected.desc}</p>
              <button className="primary-btn full" onClick={() => { addToCart(selected); setSelected(null); setDrawer(true); }}>Add to enquiry</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Mini({ icon: Icon, text }) { return <div className="mini"><span><Icon size={17} /></span>{text}<ChevronRight size={15} /></div>; }
function Trust({ icon: Icon, title, text }) { return <div className="trust-item"><Icon size={22} /><div><strong>{title}</strong><span>{text}</span></div></div>; }
function ServiceCard({ icon: Icon, title, text }) { return <article className="service-card"><div className="service-icon"><Icon size={22} /></div><h3>{title}</h3><p>{text}</p><span className="learn">Explore <ArrowRight size={15} /></span></article>; }
function Step({ n, icon: Icon, title, text }) { return <div className="step"><span className="step-no">{n}</span><div className="step-icon"><Icon size={21} /></div><h3>{title}</h3><p>{text}</p></div>; }
function Contact({ icon: Icon, title, text, href }) { const body = <><strong>{title}</strong><span>{text}</span></>; return <div className="contact-row"><Icon size={20} />{href ? <a href={href} target="_blank" rel="noreferrer">{body}</a> : <div>{body}</div>}</div>; }
function SectionHead({ kicker, title, text }) { return <div className="section-head"><span className="eyebrow">{kicker}</span><h2>{title}</h2><p>{text}</p></div>; }

createRoot(document.getElementById("root")).render(<App />);
