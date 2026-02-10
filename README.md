# Photo Gallery & Portfolio

A professional photo gallery and portfolio application built with Next.js 15, TypeScript, and Tailwind CSS. This project is designed for **demoing GitHub Copilot features** in a real-world, component-driven Next.js application. The included demos showcase how Copilot can assist with code generation, refactoring, UI building, and more.

## Demos

- All demo guides and examples are in the [`demos/`](demos/) folder.
- For more information about each demo, refer to the [README](demos/README.md) file in the `demos/` directory.
- To get started, check out the first demo [`features-demo.md`](demos/features-demo.md) for a walkthrough of gallery features and Copilot capabilities.

### Creating a New Demo

If you want to contribute and create a new demo, follow these steps:

1. Open GitHub Copilot Chat.
2. Type the prompt `/create-copilot-demo' with an explanation of your demo idea
3. Copilot will generate a new demo file in the `demos/` directory.
4. Fill in remaining sections with detailed instructions, examples, and expected results.

After finishing the demo, don't forget this quick follow-up:

1. Add in the overview, key skills, and demo link to the [demo README](demos/README.md)

## Getting Started

### Technical Requirements

- **Node.js** v18 or newer
- **npm** (or yarn, pnpm, bun)

### Quick Start with GitHub Codespaces

The fastest way to get started is using GitHub Codespaces:

1. Click the **"Code"** button on the GitHub repository page
2. Select the **"Codespaces"** tab
3. Click **"Create codespace on main"** (or your current branch)
4. Wait for the codespace to build and start

The codespace will automatically:
- Install all dependencies (`npm install`)
- Start the development server (`npm run dev`)
- Configure GitHub Copilot and essential VS Code extensions
- Forward port 3000 for the Next.js application

Once ready, you can access the application at the forwarded port URL provided in the terminal.

### Local Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ps-copilot-sandbox/copilot-intermediate-gallery-repo.git
   cd gallery-repo
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```bash
src/
├── app/                 # Next.js 15 App Router pages
│   ├── api/            # API routes (upload endpoint)
│   └── ...
├── components/          # Reusable React components
├── lib/                 # Utility functions and helpers
├── middleware.ts        # Next.js middleware (admin access control)
demos/                   # Demo guides and templates
```

## Security Features

This application implements comprehensive security hardening aligned with OWASP Top 10 best practices:

### 🔒 Key Security Features

- **Secure File Upload**: Server-side validation using magic bytes, not client MIME types
- **Image Re-encoding**: Strips metadata and neutralizes polyglot attacks using Sharp
- **Rate Limiting**: 10 uploads/minute per IP (Upstash Redis or in-memory)
- **Input Validation**: Zod schemas with tag allowlist and control character rejection
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options, and more
- **Access Control**: Feature-flag based admin route protection
- **Decompression Bomb Protection**: Max 25 megapixel limit

### 📖 Documentation

- See [SECURITY.md](SECURITY.md) for detailed security implementation guide
- See [.env.example](.env.example) for required environment variables

### 🧪 Quick Security Tests

```bash
# Test file upload
curl -X POST http://localhost:3000/api/upload \
  -F "file=@photo.jpg" \
  -F "title=My Photo" \
  -F "tags=landscape,nature"

# Verify security headers
curl -I http://localhost:3000 | grep -i "x-frame\|csp"
```

For more security testing examples, see [SECURITY.md](SECURITY.md).