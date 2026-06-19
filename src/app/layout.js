import "./globals.css";

export const metadata = {
  title: "FacultyOps — NIAT Faculty Lifecycle",
  description:
    "One secure, role-aware profile for every NIAT campus instructor — from joining to exit. The single source of truth for faculty lifecycle.",
};

// Apply the saved theme before paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-slate-50 dark:bg-slate-950">{children}</body>
    </html>
  );
}
