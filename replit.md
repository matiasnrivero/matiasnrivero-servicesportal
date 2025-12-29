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

## Role-Specific Dashboards

The Admin Dashboard (`/dashboard`) provides analytics with role-based views:

### Sections by Role
| Section | Admin | Internal Designer | Vendor | Vendor Designer |
|---------|-------|-------------------|--------|-----------------|
| Date Range Selector | Yes | Yes | Yes | Yes |
| Job Operations KPIs | Yes (all jobs) | Yes (all jobs) | Yes (vendor jobs) | Yes (own jobs) |
| Financial Performance | Yes | No | No | No |
| Top Drivers | Yes | No | No | No |
| Daily Sales Chart | Yes | No | No | No |
| Daily Orders Chart | Yes | Yes | Yes | Yes |

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