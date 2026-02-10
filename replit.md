# Overview

This application is an artwork services management platform designed to streamline the custom artwork creation workflow. It connects clients who request services with designers who deliver them, managing everything from file exchange and status tracking to commenting and designer assignment. The platform aims to be a robust, full-stack web solution for creative services businesses, offering role-based access, comprehensive reporting, and efficient project management capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Technology Stack

The application uses a monorepo structure comprising a React frontend with TypeScript, Vite, shadcn/ui (Radix UI), and Tailwind CSS. The backend is an Express.js API built with TypeScript and Node.js. PostgreSQL (Neon serverless) with Drizzle ORM handles database operations. Google Cloud Storage, integrated via Replit's sidecar authentication, is used for file storage with a custom ACL system. TanStack Query manages server state, Wouter handles client-side routing, and Express-session provides user authentication.

## Core Features

-   **Database Schema**: Features `Users` (with roles), `Services`, `Service Requests` (core entity with status, assignments, attachments, comments), and `Service Attachments` tables, all using UUIDs.
-   **API Design**: A RESTful API manages all core entities, utilizing JSON for data exchange and robust error handling.
-   **Authentication & Authorization**: Session-based authentication with `express-session` and role-based access control for five distinct roles (Admin, Internal Designer, Vendor, Vendor Designer, Client). A custom object-level ACL system is implemented for Google Cloud Storage.
-   **User Management**: Admins, Internal Designers, and Vendors can manage users, including invitations, activation/deactivation, and client payment configurations. Vendors manage their company profiles, team members, pricing, and SLAs.
-   **File Management**: Client-side direct uploads to Google Cloud Storage using presigned URLs, supported by a custom `FileUploader` component.
-   **State Management**: TanStack Query is used for server data management, including caching, synchronization, optimistic updates, and cache invalidation.
-   **UI Component Architecture**: Leverages `shadcn/ui` for a consistent design system, custom CSS variable theming, and responsive design with a mobile-first approach.
-   **Reports Module**: Provides role-based access to various reports:
    -   **Services Profit Report (Admin)**: Financial overview of services.
    -   **Vendor Payments Report (Admin & Vendor)**: Tracks monthly payments for vendor jobs, with "Mark as Paid" functionality for Admins.
    -   **Pack Profit Report (Admin)**: Financial analysis for pack subscriptions.
    -   **Royalties Deduction Report (Admin & Client)**: Tracks services and packs billed via "Deduct from Royalties."
    -   **Refund Management (Admin)**: Manages full, partial, and manual refunds, integrated with Stripe.
    -   **Client Invoicing Report (Admin)**: Generates client billing summaries based on payment methods.
    -   **Vendor SLA Performance Report (Admin)**: Tracks job delivery times vs vendor SLA targets, with filters by vendor, date range, job type, and service type. Shows on-time vs over-SLA performance via pie/bar charts and a detailed job table. SLA is measured to first delivery; change requests tracked separately. Bundle SLA uses the longest SLA from component services.
-   **Role-Specific Dashboards**: Provide tailored analytics and KPIs based on user roles, including job operations, pack jobs, financial performance (Admin only), and daily order charts.
-   **Job Auto-Assignment Engine**: Automates job routing based on vendor/designer capacity and configurable rules. It supports `least_loaded`, `round_robin`, and `priority_first` strategies, with both global (Admin) and vendor-specific automation scopes. A frontend UI allows for CRUD operations on automation rules and capacity management.
-   **Client Company Management**: Introduces a `clientCompanies` entity to manage company-wide pack subscriptions, default vendor assignments, and payment configurations.
-   **Duplicate Submission Prevention**: Protects against double job submissions using two mechanisms: (1) idempotency tokens (UUID) generated client-side and validated server-side via the `idempotencyKeys` table with unique constraints, supporting processing/success/failed status lifecycle with retry on failure; (2) content-based duplicate detection using SHA-256 request hashing with a 60-second detection window for submissions without tokens.
-   **Settings Hub**: Card-based selector layout (matching Reports Hub pattern) with drag-and-drop reordering via `@dnd-kit`. Per-user card order is persisted via `/api/user-preferences/settings-order`. Role-gated card visibility (Admin sees all 11 cards, Internal Designer sees only Input Fields). Deep linking supported via `?tab=` query parameter with role validation. Settings sections: Services, Pricing, Line Items, Bundles, Packs, Subscriptions, Automation, Discounts, Vendors, Priority, Input Fields.
-   **Reports Hub**: Card-based selector layout with drag-and-drop reordering via `@dnd-kit`. Per-user card order persisted via `/api/user-preferences/report-order`. Role-filtered report cards for Admin, Client, and Vendor roles.

# External Dependencies

## Cloud Services

-   **Google Cloud Storage**: Used for storing all project files.
-   **Neon Database**: Provides serverless PostgreSQL database hosting.

## Authentication Infrastructure

-   **Replit Sidecar**: Facilitates OAuth token exchange for accessing Google Cloud Platform services.

## Key Third-party Libraries

-   **Drizzle ORM**: Type-safe ORM for database interactions.
-   **React Hook Form & Zod**: For form validation and schema definition.
-   **date-fns**: For efficient date manipulation.
-   **Uppy**: A versatile file uploader for client-side file handling.

## Notifications & Email System

-   **SendGrid**: Integrated for sending transactional emails using a suite of 37 branded HTML templates.
-   **In-app Notifications**: A comprehensive system providing real-time user alerts and a central notification bell component.

## Environment Configuration

-   **DATABASE_URL**: PostgreSQL connection string.
-   **SESSION_SECRET**: Secret for session management.
-   **PUBLIC_OBJECT_SEARCH_PATHS**: Optional paths for public object access.
-   **SENDGRID_API_KEY**: API key for SendGrid.
-   **SENDGRID_SENDER_EMAIL**: Email address for outbound communications (e.g., services@tri-pod.com).
-   **SENDGRID_SENDER_NAME**: Display name for the sender.
-   **SUPPORT_EMAIL**: Email for customer support.
-   **PLATFORM_URL**: Base URL of the application for generating links in emails.