/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export - no Node server needed to serve the UI. The build
  // output lands in ./out and is served by the ASP.NET Core API (see
  // api/Program.cs) as static files, so the whole app is one IIS site.
  // The old src/app/api/* Route Handlers (MongoDB-backed) were removed
  // because they can't be exported - see api/ for the SQL Server replacement.
  output: "export",
};

export default nextConfig;
