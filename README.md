
<p align="center">
  <img src="./public/logo.png" alt="FeatherPress Logo" />
</p>

# FeatherPress

*Light as a feather, modular by design, powered by Markdown.*

A lightweight Node.js server designed to serve Markdown files as HTML web pages, featuring template injection, category indexes, syntax highlighting, LaTeX support, and flexible content organization.

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)  
This work is licensed under a [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

## Features Implemented

*   **Markdown Rendering:** Serves `.md` files from the `./data` directory as HTML pages.
*   **GitHub Flavored Markdown (GFM):** Supports standard Markdown plus GFM features like tables and fenced code blocks.
*   **Syntax Highlighting:** Automatic syntax highlighting for fenced code blocks using `marked-highlight`.
*   **LaTeX Support:** Renders inline (`$...$`) and block (`$$...$$`) LaTeX math expressions using KaTeX.
*   **Raw HTML Passthrough:** Allows embedding raw HTML, including `<script>` and `<style>` tags, directly within Markdown files (use with caution).
*   **Templating System:**
    *   **Header/Footer:** Automatically prepends `template/header.md` and appends `template/footer.md` to every rendered page (parsed as Markdown).
    *   **Custom Template Injection:** Inject reusable Markdown snippets from the `./template` directory using the `!{{template_name}{JSON_data}}` syntax, with placeholder substitution.
*   **Category Index Pages:** Automatically serves a `default.md` file when a category directory URL (e.g., `/blog`) is requested. This file is **mandatory** for each content subdirectory within `./data`.
*   **Landing Page:** Serves a specific `public/landing.md` file for the root URL (`/`).
<!-- *   **Relative Asset Resolution:** Correctly resolves relative links and image paths within Markdown files based on the file's location and serves them via a dedicated `/assets` route. -->
*   **Security:** Uses a `blacklist.json` file to prevent serving sensitive files or directories.
*   **Custom 404 Page:** Displays a user-friendly `public/404.html` page for routes that are not found or are blacklisted.
*   **Favicon Support:** Serves `public/favicon.ico` and links it in the HTML head.
*   **Global Stylesheet:** Serves a single global `public/style.css` file linked in every page.

---

## Filesystem Structure

The project expects the following directory layout:

```
project/
├── data/                      # Root directory for all Markdown content
│   ├── blog/                  # Example category directory (maps to /blog)
│   │   ├── post1.md           # Content file (maps to /blog/post1)
│   │   ├── default.md         # Mandatory index for the /blog category
│   │   └── rsc/               # Optional subdirectory for post-specific assets
│   │       └── sample.png
│   └── tutorials/             # Another example category
│       ├── intro.md
│       └── default.md         # Mandatory index for the /tutorials category
├── template/                  # Directory for reusable Markdown templates
│   ├── header.md              # Automatically prepended to every page
│   ├── footer.md              # Automatically appended to every page
│   └── custom.md              # Example injectable template
├── public/                    # Directory for public static assets
│   ├── style.css              # Global stylesheet (served at /style.css)
│   ├── landing.md             # Markdown for the root '/' page
│   ├── 404.html               # Custom Not Found page
│   └── favicon.ico            # Site icon (served at /favicon.ico)
├── blacklist.json             # Security: List of forbidden URL paths/prefixes
├── server.js                  # Main Node.js server application logic
├── package.json               # Node.js project metadata and dependencies
└── package-lock.json          # Locked dependency versions

```

---

## File Responsibilities

*   **`server.js`**: Contains all the Node.js/Express logic for routing, file reading, Markdown parsing, template processing, security checks, and serving static assets. This is the core application.
*   **`package.json`**: Defines the project, its dependencies (`express`, `marked`, `marked-highlight`, `katex`), and provides basic scripts (like `npm start`).
*   **`blacklist.json`**: A JSON array of URL paths or path prefixes (strings ending with `/`) that the server should *refuse* to serve. This prevents accidental exposure of server files, configuration, or directories like `.git`.
*   **`./data/`**: The **only** place where Markdown files intended as content pages should reside. Subdirectories automatically become URL path segments.
*   **`./data/**/default.md`**: **Mandatory** index file for each subdirectory within `data`. Served when the user requests the directory path itself (e.g., `/blog` serves `./data/blog/default.md`). Used to list content within that category.
*   **`./template/`**: Holds reusable Markdown snippets.
    *   `header.md`/`footer.md`: Automatically included wrapper content.
    *   Other `.md` files: Can be injected into content pages using the `!{{...}}` syntax.
*   **`./public/`**: Holds static assets accessible directly via URL paths *managed by specific middleware* in `server.js`.
    *   `style.css`: Global styles served at `/style.css`.
    *   `favicon.ico`: Site icon served at `/favicon.ico`.
    *   `landing.md`: Special Markdown file rendered for the site root (`/`).
    *   `404.html`: Static HTML page served for "Not Found" errors.
*   **Content Assets (`./data/**/rsc/`, etc.)**: Images or other files referenced *relatively* within Markdown content are served via the `/assets/` URL path prefix.

---

## Requirements

*   **Node.js**: A recent version (LTS recommended).
*   **npm**: Node Package Manager (usually comes with Node.js).

---

## Installation

1.  **Clone or Download:** Get the project files onto your local machine.
    ```bash
    git clone this-page-url # If using Git
    # or download and extract the ZIP file
    ```
2.  **Navigate to Directory:** Open your terminal or command prompt and change into the project's root directory.
    ```bash
    cd repo_name
    ```
3.  **Install Dependencies:** Run npm to download the required libraries defined in `package.json`.
    ```bash
    npm install
    ```
    This will create the `node_modules` directory.

---

## Running the Server

1.  **Start the Server:** Run the following command from the project's root directory:
    ```bash
    node server.js
    # or if you prefer using the script defined in package.json:
    # npm start
    ```
2.  **Access the Site:** Open your web browser and navigate to `http://localhost:3000` (or the port specified in the server console output, if different).
    *   `http://localhost:3000/` will show the content from `public/landing.md`.
    *   `http://localhost:3000/blog` will show the content from `data/blog/default.md`.
    *   `http://localhost:3000/blog/post1` will show the content from `data/blog/post1.md`.
    *   Navigating to a non-existent or blacklisted path will show `public/404.html`.

3.  **Stop the Server:** Press `Ctrl + C` in the terminal where the server is running.

---

## Configuration (`blacklist.json`)

The `blacklist.json` file controls which URL paths are explicitly forbidden. This is a crucial security measure.

*   **Format:** A simple JSON array of strings.
*   **Matching:**
    *   Exact paths (e.g., `"/package.json"`) block requests for that specific URL.
    *   Path prefixes (strings ending with `/`, e.g., `"/node_modules/"`) block requests for *any* URL starting with that prefix.

**Example `blacklist.json`:**

```json
[
  "/server.js",
  "/package.json",
  "/package-lock.json",
  "/blacklist.json",
  "/node_modules/",
  "/.git/",
  "/.env",
  "/template/",
  "/public/"
]
```

**Important:** Always restart the server after modifying `blacklist.json` for changes to take effect.

---

## Content Creation

### Location and Categories

*   All primary content pages must be Markdown files (`.md`) placed within the `./data/` directory or its subdirectories.
*   Subdirectories within `./data/` directly map to URL path segments. For example, a file at `./data/projects/alpha/details.md` will be accessible at the URL `/projects/alpha/details`.

### Category Index (`default.md`) - Mandatory

*   Every subdirectory you create within `./data/` **must** contain a file named `default.md`.
*   This file serves as the index page for that category. When a user navigates to the URL corresponding to the directory (e.g., `/projects/alpha`), the server will render and display the content of `default.md` from that directory.
*   Use this file to list or introduce the content within that category.

**Example: `./data/blog/default.md`**

```markdown
# Blog Posts

Here you'll find articles about various topics.

*   [My First Post](/blog/post1)
*   [Another Interesting Topic](/blog/post2)

Go back [Home](/).
```

### Markdown Formatting

The server supports a rich set of Markdown features:

1.  **Standard Markdown & GFM:** Headings (`# H1` to `###### H6`), bold (`**bold**`), italics (`*italic*`), links (`[text](/path)` or `[text](URL)`), ordered/unordered lists, blockquotes (`> quote`), tables (GFM style).

2.  **Code Blocks:** Use fenced code blocks with language identifiers for syntax highlighting via `marked-highlight`.

    ````markdown
    ```javascript
    function hello(name) {
      console.log(`Greetings, ${name}!`);
    }
    ```

    ```python
    print("Hello from Python!")
    ```
    ````

3.  **LaTeX Math:** Embed mathematical notation using KaTeX.
    *   **Inline:** Wrap with single dollar signs (`$`). Example: `The equation is $E = mc^2$.`
    *   **Block:** Wrap with double dollar signs (`$$`). Example:
        ```markdown
        $$
        \int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
        $$
        ```

4.  **Raw HTML:** Embed standard HTML tags directly in your Markdown.
    *   `<p style="color:blue;">Blue text.</p>`
    *   `<details><summary>Click Me</summary>Hidden content.</details>`
    *   You can even include `<style>` and `<script>` tags.
    *   **Security Warning:** Raw HTML (especially scripts) is passed through directly. Only enable this if you fully trust the source of all your Markdown content. Malicious scripts could be embedded otherwise.

5.  **Relative Links & Images:**
    *   Link to other Markdown pages using root-relative paths: `[Link Text](/category/page)`
    *   Reference images or other assets relative to the *current Markdown file's directory*: `![Alt Text](./rsc/image.png)`.
    *   The server automatically resolves these relative paths and serves the linked assets via the `/assets/` URL path (e.g., `./rsc/image.png` in `data/blog/post1.md` becomes `/assets/data/blog/rsc/image.png`).

---

## Templating System

### Header and Footer

*   The content of `template/header.md` is automatically processed as Markdown and inserted at the *very beginning* of every rendered page's HTML `<body>`.
*   The content of `template/footer.md` is automatically processed as Markdown and inserted at the *very end* of every rendered page's HTML `<body>` (before the closing `</body>` tag).
*   Use these for common navigation, site titles, copyright notices, etc.

### Custom Template Injection

You can inject reusable Markdown snippets from the `./template/` directory into any other Markdown file (`.md` files in `./data/` or `public/landing.md`).

*   **Syntax:** `!{{template_name}{JSON_data}}`
    *   `template_name`: The name of the template file in `./template/` *without* the `.md` extension (e.g., `custom` for `template/custom.md`).
    *   `JSON_data`: A valid JSON object enclosed in curly braces `{}`. This object provides key-value pairs used for placeholder substitution within the template. Use `{}` for no data.

*   **Placeholders:** Inside the template file (e.g., `template/custom.md`), use double curly braces `{{key}}` to denote where values from the JSON data should be inserted.

**Example:**

1.  **`./template/custom.md`:**
    ```markdown
    > **Note:** This content was injected from a template!
    > The value passed for 'name' was: **{{name}}**
    > The value for 'topic' was: *{{topic}}*
    ```

2.  **`./data/blog/post1.md` (Usage):**
    ```markdown
    This is the main content of post 1.

    Now, let's inject the 'custom' template:
    !{{custom}{ "name": "Alice", "topic": "Server Features" }}

    And here's another injection with different data:
    !{{custom}{ "name": "Bob", "topic": "Markdown Fun" }}

    Injecting with no data (placeholders won't be replaced):
    !{{custom}{}}
    ```

*   **Rendering:** The server finds the `!{{...}}` tag, reads the corresponding template file, replaces the `{{key}}` placeholders with values from the provided JSON, processes the resulting snippet *as Markdown* (including any LaTeX or code blocks within the template), and inserts the final HTML in place of the original `!{{...}}` tag. Templates can even contain other template injection tags (basic nesting is supported).

---

## Asset Handling

*   **Global CSS:** `public/style.css` is automatically linked in the `<head>` of every page and served at `/style.css`.
*   **Favicon:** `public/favicon.ico` is automatically linked in the `<head>` and served at `/favicon.ico`.
*   **Content Assets (Images, etc.):** Files referenced relatively (`./path/to/asset.ext`) within Markdown files (in `data/` or `public/landing.md`) are served via the `/assets/` route. The server maps the relative path to the correct location within the project directory.

---

## Troubleshooting

*   **CSS/Favicon Not Updating:** Browsers cache these aggressively. Clear your browser cache thoroughly or use a private/incognito window after making changes.
*   **Changes Not Appearing:** Ensure you have **stopped and restarted** the `node server.js` process after modifying any server-side files (`.js`, `.json`) or templates.
*   **404 Errors:**
    *   Verify the URL path exactly matches the file path structure under `./data/` (e.g., `/blog/post1` needs `data/blog/post1.md`).
    *   Ensure the requested path is not listed in `blacklist.json`.
    *   If requesting a category URL (e.g., `/blog`), ensure the **mandatory** `data/blog/default.md` file exists.
*   **Template Injection Errors:** Check the server console for warnings about "Invalid JSON" or "Template file not found". Ensure your JSON syntax is correct (`"key": "value"`) and the template name matches a file in `./template/`.
*   **Relative Image/Link Errors:** Ensure the relative path is correct *from the perspective of the Markdown file containing the link*. Check the server console for path resolution warnings.

---

## Personal notes 

- Might add caching of the available categories and posts later on the server to allow for JS to get a JSON with all the posts. All that if someone wants to build a search engine.
