# Overview

This application is an artwork services management platform enabling clients to request and designers to deliver custom artwork. It streamlines the artwork creation workflow, including file management, status tracking, commenting, and designer assignment. The project aims to provide a robust, full-stack web solution for managing a creative services business, supporting a diverse user base with role-based access and detailed reporting.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Technology Stack

- **Frontend**: React with TypeScript, Vite, shadcn/ui (Radix UI), and Tailwind CSS.
- **Backend**: Express.js with TypeScript and Node.js.
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM.
- **File Storage**: Google Cloud Storage, integrated via Replit's sidecar authentication, with a custom ACL system.
- **State Management**: TanStack Query for server state.
- **Routing**: Wouter for client-side routing.
- **Session Management**: Express-session for user authentication.

## Project Structure

A monorepo structure with `client/` (React app), `server/` (Express API), and `shared/` (database schema). Path aliases (`@/`, `@shared/`, `@assets/`) are used for clean imports.

## Database Schema

Four main tables:
- **Users**: User accounts with authentication, roles (client, designer, admin), and UUIDs.
- **Services**: Catalog of artwork services with pricing and status.
- **Service Requests**: Core entity for client orders, including status, designer assignment, due dates, and change requests.
- **Service Attachments**: File references linked to service requests.
- **Comments**: Discussion threads on service requests.

All tables use UUID primary keys.

## API Design

RESTful API endpoints manage users, services, service requests (CRUD, assignment, delivery, attachments, comments), and object storage. JSON is used for data exchange, with robust error handling.

## Authentication & Authorization

- **Session-based Authentication**: `express-session` manages user sessions and roles.
- **Role-based Access Control**: Five roles (Admin, Internal Designer, Vendor, Vendor Designer, Client) with distinct permissions, including user management, service request visibility, and pricing access.
- **Object-level ACL**: Custom system for Google Cloud Storage files, defining owner, visibility, and group permissions.

## User Management

- **User Management Page**: Admins, Internal Designers, and Vendors can search, filter, invite, activate/deactivate users, and configure client payment methods (Admin only).
- **Vendor Profile Page**: Vendors manage company info, team members, pricing agreements, and SLAs.

## File Upload Strategy

Client-side direct uploads to Google Cloud Storage using presigned URLs, enhancing performance and scalability. A custom `FileUploader` component provides UI and progress tracking.

## State Management Pattern

TanStack Query manages server data, caching, and synchronization. Optimistic updates and strategic cache invalidation are employed.

## UI Component Architecture

- **Design System**: shadcn/ui components (Radix UI + Tailwind CSS) for consistency and accessibility.
- **Custom Theming**: CSS variables for color palette and typography.
- **Responsive Design**: Mobile-first approach with `useIsMobile` hook.

## Reports Module

Role-based access to reports (Admin, Client, Vendor).
- **Reports Hub**: Central page for role-specific reports.
- **Services Profit Report (Admin only)**: Comprehensive financial report with summaries, filters (vendor, service, date), search (client, job ID), and a detailed data table. Pricing calculations consider retail price, vendor cost, and exception rules.
- **Vendor Payments Report (Admin and Vendor)**: Monthly payment tracking for vendor-completed jobs.
  - **Schema Fields**: `vendorPaymentStatus`, `vendorPaymentPeriod`, `vendorPaymentMarkedAt`, `vendorPaymentMarkedBy`, `vendorCost` on both `serviceRequests` and `bundleRequests`.
  - **Filtering Logic**: Jobs appear based on `vendorPaymentPeriod` if set, otherwise `deliveredAt` month. Only delivered jobs are included.
  - **Role Access**: Admin has full access with "Mark as Paid" functionality; Vendor has read-only access to their own jobs.
  - **Exclusions**: Jobs assigned to admin or internal_designer roles have $0 cost and are excluded from payment reports.
  - **Exports**: CSV and PDF exports with job details, vendor names, and payment status.
  - **API Endpoints**: `GET /api/reports/vendor-payments`, `POST /api/reports/vendor-payments/mark-paid`, `GET /api/reports/vendor-payments/jobs`.
  - **Packs Tab**: Shows pack subscriptions where vendors have completed jobs, with mark-as-paid functionality.
- **Pack Profit Report (Admin only)**: Financial analysis for monthly pack subscriptions.
  - Revenue, vendor cost, and profit margin calculations per pack subscription
  - Monthly period filtering
  - Summary totals with CSV/PDF export
- **Royalties Deduction Report (Admin and Client)**: Tracks services and packs billed via "Deduct from Royalties" payment method.
  - Two tabs: Services and Packs
  - Monthly period filtering
  - Client-scoped views for client role

## Role-Specific Dashboards

The Admin Dashboard (`/dashboard`) provides analytics with role-based views:

### Sections by Role
| Section | Admin | Internal Designer | Vendor | Vendor Designer |
|---------|-------|-------------------|--------|-----------------|
| Date Range Selector | Yes | Yes | Yes | Yes |
| Job Operations KPIs | Yes (all jobs) | Yes (all jobs) | Yes (vendor jobs) | Yes (own jobs) |
| Pack Jobs KPIs | Yes (all packs) | Yes (all packs) | Yes (vendor packs) | Yes (own packs) |
| Financial Performance | Yes | No | No | No |
| Top Drivers | Yes | No | No | No |
| Daily Sales Chart | Yes | No | No | No |
| Daily Orders Chart | Yes | Yes | Yes | Yes |

### Financial Performance Sections (Admin Only)
- **Services & Bundles**: Sales, Orders, Avg Order, Vendor Cost, Profit, Margin
- **Monthly Packs**: Pack Revenue, Pack Profit, Pack Margin
- **Combined Totals**: Total Revenue, Total Profit, Total Margin

### API Endpoints
- **`GET /api/dashboard/summary`**: Returns job status counts, financial metrics (admin only), comparison percentages
- **`GET /api/dashboard/daily-orders`**: Returns daily order counts for chart visualization

### Data Filtering
- **Admin/Internal Designer**: Access to all jobs system-wide
- **Vendor**: Filtered by `vendorAssigneeId` matching the vendor's `vendorId` (or `userId` fallback)
- **Vendor Designer**: Filtered by `assigneeId` matching the user's ID

### Date Range Presets
11 preset options: Today, Yesterday, Last 7 Days, Last 30 Days, Last 90 Days, Last 365 Days, This Month, Last Month, This Year, Last Year, Custom Range. Uses `startOfDay`/`endOfDay` from date-fns for precision.

## Job Auto-Assignment Engine (Phase 3 Complete)

Fully functional automation engine for automatic job routing based on vendor/designer capacity and configurable rules, with complete frontend management UI.

### Backend (Phases 1-2)
- **Database Tables**: `vendorServiceCapacities`, `vendorDesignerCapacities`, `automationRules`, `automationAssignmentLogs`.
- **Service Request Extensions**: Fields like `autoAssignmentStatus`, `lastAutomationRunAt`, `lastAutomationNote`, `lockedAssignment`.
- **API Endpoints**: Manage capacities and automation rules.
- **Authorization**: Granular access control for automation configuration based on user roles.
- **Routing Strategies**: `least_loaded`, `round_robin`, `priority_first` - all implemented with fair distribution.
- **Automation Scopes**: `global` (admin) and `vendor` (vendor-managed).
- **Automation Engine** (`server/services/automationEngine.ts`): Processes new service requests, matches against active rules, selects vendors/designers based on capacity and routing strategy, logs all decisions for audit trail.
- **Auto-Trigger**: Automatically invoked on service request creation when no manual assignment is provided.

### Frontend (Phase 3)
- **AutomationSettingsTab** (`client/src/components/AutomationSettings.tsx`): Admin interface for global automation rules CRUD - create, edit, delete rules with vendor selection, service filters, routing strategy, and priority configuration.
- **Settings.tsx Automation Tab**: Admin-only access to global automation rules management.
- **VendorProfile.tsx Automation Tab**: Vendors manage their service capacities (daily capacity, priority, routing strategy) and designer capacities (per-designer service assignments with primary flag).

## Client Company Entity Management (Phase 7)

Two-tier client model for organizational pack subscriptions and vendor assignments.

### Database Schema
- **clientCompanies**: Canonical organizational entity for company-wide pack subscriptions.
  - Fields: `name`, `industry`, `website`, `email`, `phone`, `address`, `primaryContactId`, `defaultVendorId`, `paymentConfiguration`, `notes`, `isActive`.
  - Links users via `users.clientCompanyId` foreign key.
- **clientProfiles**: Legacy client profiles retained for backward compatibility.
- **clientPackSubscriptions**: Supports both `clientProfileId` (legacy) and `clientCompanyId` (new).

### API Endpoints
- **`GET /api/org-companies`**: List all organizational companies (Admin only).
- **`GET /api/org-companies/:id`**: Get single company with members and contact info.
- **`POST /api/org-companies`**: Create new organizational company.
- **`PATCH /api/org-companies/:id`**: Update company details.
- **`DELETE /api/org-companies/:id`**: Soft delete company.
- **`GET /api/org-companies/:id/members`**: Get company members.
- **`POST /api/org-companies/:id/members`**: Add user to company.
- **`DELETE /api/org-companies/:id/members/:userId`**: Remove user from company.

### Frontend
- **OrgCompanies.tsx** (`/org-companies`): Consolidated company management page with tabs:
  - **Organizations Tab**: New organizational entities for pack subscriptions and vendor assignments.
  - **Legacy Clients Tab**: Read-only access to legacy clientProfiles for migration reference.
- **Navigation**: Single "Companies" link in header points to consolidated experience.

### Company-Level Features
- **Pack Subscriptions**: Support `clientCompanyId` for company-wide subscriptions.
- **Vendor Assignment**: `defaultVendorId` on companies for automatic vendor routing.
- **Payment Configuration**: Company-level payment method (pay_as_you_go, monthly_payment, deduct_from_royalties).
- **Reports**: Vendor Payments Packs report shows company names from both clientCompanies and clientProfiles.

# External Dependencies

## Cloud Services

- **Google Cloud Storage**: For file storage, using the Node.js client library.
- **Neon Database**: Serverless PostgreSQL.

## Authentication Infrastructure

- **Replit Sidecar**: Provides OAuth token exchange for Google Cloud Platform services.

## Key Third-party Libraries

- **Drizzle ORM**: Type-safe ORM with `drizzle-kit` and `drizzle-zod`.
- **React Hook Form & Zod**: For type-safe form validation.
- **date-fns**: For date manipulation.
- **Uppy**: File upload framework for client-side uploads.

## Environment Configuration

- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: Secret key for session signing.
- `PUBLIC_OBJECT_SEARCH_PATHS`: Optional public object access paths.