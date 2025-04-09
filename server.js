/* ==================================
 * Markdown Static Blog Server
 * ================================== */

// --- Core Dependencies ---
const express = require('express');
const fs = require('fs').promises; // Use promise-based fs for async/await
const path = require('path');

// --- Markdown & Syntax Highlighting ---
const { Marked, Renderer } = require('marked');     // Use Marked class for instances
const { markedHighlight } = require("marked-highlight"); // Extension for highlighting
const hljs = require('highlight.js/lib/core');       // Core highlight.js engine
// --- ^^ Yes, hljs is still needed! `marked-highlight` uses it (or another engine)
//     to actually perform the syntax analysis and generate highlighted HTML.
//     We need to load the core and register the languages we want hljs to support.

// --- LaTeX Rendering ---
const katex = require('katex');

/* ==================================
 * Highlight.js Language Registration
 * ================================== */
// Register the languages you want highlight.js to be able to process.
// Add or remove languages as needed for your content.
hljs.registerLanguage('javascript', require('highlight.js/lib/languages/javascript'));
hljs.registerLanguage('python', require('highlight.js/lib/languages/python'));
hljs.registerLanguage('xml', require('highlight.js/lib/languages/xml')); // For HTML/XML
hljs.registerLanguage('css', require('highlight.js/lib/languages/css'));
hljs.registerLanguage('json', require('highlight.js/lib/languages/json'));
hljs.registerLanguage('bash', require('highlight.js/lib/languages/bash')); // Shell/Bash
hljs.registerLanguage('markdown', require('highlight.js/lib/languages/markdown'));
// Example: hljs.registerLanguage('java', require('highlight.js/lib/languages/java'));


/* ==================================
 * Express App Setup
 * ================================== */
const app = express();
const PORT = process.env.PORT || 3000;


/* ==================================
 * Configuration Constants
 * ================================== */
const DATA_DIR = path.resolve(__dirname, 'data');
const TEMPLATE_DIR = path.join(__dirname, 'template');
const PUBLIC_DIR = path.join(__dirname, 'public');
const BLACKLIST_PATH = path.join(__dirname, 'blacklist.json');
const HEADER_PATH = path.join(TEMPLATE_DIR, 'header.md');
const FOOTER_PATH = path.join(TEMPLATE_DIR, 'footer.md');
const LANDING_PAGE_PATH = path.join(PUBLIC_DIR, 'landing.md');
const NOT_FOUND_PAGE_PATH = path.join(PUBLIC_DIR, '404.html');
const CATEGORY_INDEX_FILE = 'default.md'; // Filename for category listings
const CSS_STYLESHEET = 'style_2.css';     // Specific CSS filename to use


/* ==================================
 * Global Variables
 * ================================== */
let forbiddenRoutes = new Set(); // Stores blacklisted URL paths/prefixes


/* ==================================
 * Helper Functions
 * ================================== */

/**
 * Loads the blacklist from blacklist.json into the forbiddenRoutes Set.
 */
async function loadBlacklist() {
    try {
        const data = await fs.readFile(BLACKLIST_PATH, 'utf8');
        const routes = JSON.parse(data);
        if (!Array.isArray(routes)) { throw new Error('Blacklist must be an array.'); }
        forbiddenRoutes = new Set(routes);
        console.log(`Blacklist loaded: ${routes.length} rules.`);
    } catch (error) {
        // Log error but continue, potentially insecurely without blacklist
        console.error(`Error loading blacklist.json: ${error.message}. Server starting without blacklist rules.`);
        forbiddenRoutes = new Set();
    }
}

/**
 * Processes custom template syntax: !{{template_name}{JSON_data}}
 * Replaces the tag with the rendered Markdown content of the template file.
 */
async function processCustomTemplates(markdownContent, basePathForTemplates) {
    const templateRegex = /!\{\{([^}]+?)\}\{(.*?)\}\}/gs;
    let processedContent = markdownContent;
    let match;

    while ((match = templateRegex.exec(processedContent)) !== null) {
        const [fullMatch, templateName, rawJsonDataString] = match;
        let templateData = {};
        const jsonDataString = rawJsonDataString.trim();
        // Basic Debugging
        // console.log(`DEBUG: Template Tag Found: ${fullMatch}`);
        // console.log(`DEBUG: Trimmed JSON String for Parsing: >>${jsonDataString}<<`);

        try {
            // Parse JSON data if provided
            if (jsonDataString !== '{}' && jsonDataString !== '') {
                let stringToParse = jsonDataString;
                 if (!stringToParse.startsWith('{') || !stringToParse.endsWith('}')) {
                    stringToParse = `{${stringToParse}}`; // Auto-add braces if needed
                 }
                 templateData = JSON.parse(stringToParse);
            } else {
                templateData = {}; // Handle empty {} or whitespace
            }
        } catch (e) {
            console.warn(`Warning: Invalid JSON in template tag ${fullMatch}. Content: >>${jsonDataString}<<. Error: ${e.message}. Skipping.`);
            processedContent = processedContent.replace(fullMatch, `<!-- Invalid JSON: ${e.message} -->`);
            templateRegex.lastIndex = 0; continue;
        }

        const templateFilePath = path.join(TEMPLATE_DIR, `${templateName}.md`);
        try {
            let templateContent = await fs.readFile(templateFilePath, 'utf8');
            // Recursively process templates within the loaded template FIRST
            templateContent = await processCustomTemplates(templateContent, templateFilePath);
            // Replace placeholders {{key}}
            for (const key in templateData) {
                const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                templateContent = templateContent.replace(placeholder, templateData[key]);
            }
            // Replace the original tag
            processedContent = processedContent.replace(fullMatch, templateContent);
            templateRegex.lastIndex = 0;
        } catch (error) {
            const errorMsg = error.code === 'ENOENT' ? 'not found' : `read error (${error.message})`;
            console.warn(`Warning: Template file ${templateName}.md ${errorMsg}. Skipping injection.`);
            processedContent = processedContent.replace(fullMatch, `<!-- Template ${templateName}.md ${errorMsg} -->`);
            templateRegex.lastIndex = 0;
        }
    }
    return processedContent;
}

/**
 * Processes $...$ and $$...$$ LaTeX delimiters using KaTeX server-side.
 * Returns HTML string with rendered math.
 */
function processLatex(markdownContent) {
    // Inline LaTeX: $...$ (non-greedy match)
    markdownContent = markdownContent.replace(/\$(.+?)\$/g, (match, latex) => {
        try {
            return katex.renderToString(latex.trim(), { throwOnError: false, displayMode: false });
        } catch (e) {
            console.warn(`KaTeX inline rendering error: ${e.message}`);
            return `<code>${latex}</code> (KaTeX Error)`;
        }
    });
    // Block LaTeX: $$...$$ (non-greedy match, handles multiline)
     markdownContent = markdownContent.replace(/\$\$([\s\S]+?)\$\$/g, (match, latex) => {
        try {
            return katex.renderToString(latex.trim(), { throwOnError: false, displayMode: true });
        } catch (e) {
            console.warn(`KaTeX block rendering error: ${e.message}`);
            return `<pre><code>${latex}</code></pre><p>(KaTeX Error)</p>`;
        }
    });
    return markdownContent;
}

/**
 * Checks if a given request path is forbidden based on the loaded blacklist.
 */
function isBlacklisted(reqPath) {
    if (forbiddenRoutes.has(reqPath)) {
        return true;
    }
    // Check for prefix blacklist (e.g., "/node_modules/")
    for (const forbidden of forbiddenRoutes) {
        if (forbidden.endsWith('/') && reqPath.startsWith(forbidden)) {
            return true;
        }
    }
    return false;
}


/* ==================================
 * marked-highlight Setup
 * ================================== */

/**
 * Async function to perform syntax highlighting using the configured hljs instance.
 * This function is passed to the marked-highlight extension.
 */
const highlightCode = async (code, lang) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'; // Detect or fallback
    console.log(`Highlighting attempt (marked-highlight): lang='${language}' (original: '${lang || 'none'}')`);
    try {
        // Use the configured hljs instance
        const result = hljs.highlight(code, { language: language, ignoreIllegals: true });
        console.log(`Highlighting successful for lang='${language}'`);
        return result.value; // Return highlighted HTML
    } catch (error) {
        console.error(`Highlight.js server-side error via marked-highlight (lang: ${language}): ${error}`);
        // Fallback: return escaped plain code on error
        return code.replace(/</g, "<").replace(/>/g, ">");
    }
};

/**
 * Instantiate the marked-highlight extension.
 */
const highlightExtension = markedHighlight({
    langPrefix: 'hljs language-', // CSS class prefix for styling (matches common themes)
    highlight: highlightCode,     // The async function defined above
    async: true                   // Tell marked-highlight the function is async
});


/* ==================================
 * Main Markdown Rendering Function
 * ================================== */

/**
 * Reads, processes (templates, LaTeX), parses (Markdown), and renders a full HTML page.
 * Uses an instance of Marked configured with marked-highlight.
 */
async function renderMarkdownPage(markdownFilePath, reqPath) {
    try {
        const mdFileDir = path.dirname(markdownFilePath);

        // --- Read Content Files ---
        const [headerMd, footerMd, mainMd] = await Promise.all([
            fs.readFile(HEADER_PATH, 'utf8').catch(() => ''), // Gracefully handle missing header/footer
            fs.readFile(FOOTER_PATH, 'utf8').catch(() => ''),
            fs.readFile(markdownFilePath, 'utf8') // Let error propagate if main file is missing
        ]);

        // --- Pre-processing Steps ---
        // 1. Process custom templates (Runs recursively)
        let processedMainMd = await processCustomTemplates(mainMd, markdownFilePath);
        const processedHeaderMd = await processCustomTemplates(headerMd, HEADER_PATH);
        const processedFooterMd = await processCustomTemplates(footerMd, FOOTER_PATH);

        // 2. Combine all markdown parts
        let fullMarkdown = `${processedHeaderMd}\n\n${processedMainMd}\n\n${processedFooterMd}`;

        // 3. Process LaTeX math delimiters server-side
        fullMarkdown = processLatex(fullMarkdown);

        // --- Markdown Parsing Setup ---
        // 4. Define Renderer for handling relative asset paths
        const renderer = new Renderer();
        renderer.image = (href, title, text) => {
            let resolvedHref = href;
            try {
                if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/')) {
                     const absoluteImagePath = path.resolve(mdFileDir, href);
                     if (absoluteImagePath.startsWith(DATA_DIR) || absoluteImagePath.startsWith(PUBLIC_DIR)) {
                        const serverRelativePath = path.relative(__dirname, absoluteImagePath);
                        resolvedHref = path.join('/assets', serverRelativePath).replace(/\\/g, '/');
                     } else { console.warn(`Image path escape prevented: ${href}`); resolvedHref = '#'; }
                }
            } catch(e){ console.error("Error resolving image path:", href, e); resolvedHref = '#';}
             return Renderer.prototype.image.call(renderer, resolvedHref, title, text);
        };
         renderer.link = (href, title, text) => {
            let resolvedHref = href;
             const isAssetLink = href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/') && !href.startsWith('#') && !/\.md$/i.test(href);
            try {
                if (isAssetLink) {
                    const absoluteLinkPath = path.resolve(mdFileDir, href);
                    if (absoluteLinkPath.startsWith(DATA_DIR) || absoluteLinkPath.startsWith(PUBLIC_DIR)) {
                         const serverRelativePath = path.relative(__dirname, absoluteLinkPath);
                         resolvedHref = path.join('/assets', serverRelativePath).replace(/\\/g, '/');
                    } else { console.warn(`Asset link path escape prevented: ${href}`); resolvedHref = '#'; }
                }
            } catch(e){ console.error("Error resolving asset link path:", href, e); resolvedHref = '#';}
            return Renderer.prototype.link.call(renderer, resolvedHref, title, text);
        };

        // 5. Create a Marked instance with extensions and options for this request
        const markedInstance = new Marked(
            highlightExtension, // Apply the configured marked-highlight extension
            {                 // Pass other standard Marked options
                renderer: renderer, // Use our custom renderer for paths
                pedantic: false,
                gfm: true,
                breaks: false,
                sanitize: false,   // IMPORTANT: Ensure content is trusted if false
                smartLists: true,
                smartypants: false,
                xhtml: false
                // No 'highlight' option needed here - handled by the extension
            }
        );

        // --- Parsing ---
        // 6. Parse the final Markdown string to HTML using the configured instance
        const htmlContent = await markedInstance.parse(fullMarkdown);

        // --- Final HTML Assembly ---
        // 7. Generate Page Title
        let pageTitle = 'Home';
        if (reqPath && reqPath !== '/') {
            pageTitle = path.basename(reqPath, '.md') || path.basename(path.dirname(reqPath));
            pageTitle = pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1);
        }

        // 8. Construct the complete HTML document string
        const finalHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/${CSS_STYLESHEET}"> 
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css" integrity="sha384-wcIxkf4k55goVP2ynZZBOhk+aJxIoCymBbQtxMQ72WA0Lk4//rWwkLVOlvLDBRsd" crossorigin="anonymous"> 
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
</head>
<body>
    <div class="container">
        ${htmlContent} 
    </div>
</body>
</html>`;
        return finalHtml; // Return the complete page

    } catch (error) {
        // Handle file not found for the main requested Markdown file
        if (error.code === 'ENOENT' && error.path === markdownFilePath) {
            throw error; // Propagate to route handler for 404 response
        }
        // Log other unexpected errors during rendering
        console.error(`Error rendering page for Markdown file ${markdownFilePath}:`, error);
        throw new Error('Internal Server Error during page rendering'); // Throw generic error
    }
}


/* ==================================
 * Express Middleware Setup
 * ================================== */

// Serve Favicon
app.use('/favicon.ico', express.static(path.join(PUBLIC_DIR, 'favicon.ico'), { fallthrough: false }));

// Serve the main Stylesheet using the configured filename
app.use(`/${CSS_STYLESHEET}`, express.static(path.join(PUBLIC_DIR, CSS_STYLESHEET), { fallthrough: false }));

// Serve static assets referenced relatively from Markdown (maps /assets/... to project root)
app.use('/assets', express.static(__dirname, { fallthrough: false }));


/* ==================================
 * Express Route Handlers
 * ================================== */

// --- Root Route (Landing Page) ---
app.get('/', async (req, res) => {
    try {
        console.log(`Serving landing page: ${LANDING_PAGE_PATH}`);
        const finalHtml = await renderMarkdownPage(LANDING_PAGE_PATH, '/');
        res.send(finalHtml);
    } catch (error) {
         console.error(`Error serving landing page ${LANDING_PAGE_PATH}:`, error);
         // Attempt to send the custom 404 page even on landing page errors
         try {
             await fs.access(NOT_FOUND_PAGE_PATH);
             res.status(500).sendFile(NOT_FOUND_PAGE_PATH);
         } catch (e404) {
             console.error("FATAL: 404.html page not found!");
             res.status(500).send('Internal Server Error (and 404 page missing).');
         }
    }
});

// --- Wildcard Route (Handles all other content requests) ---
app.get('*', async (req, res) => {
    let reqPath = req.path;

    // Normalize path: remove trailing slash if present (and not the root)
    if (reqPath !== '/' && reqPath.endsWith('/')) {
        reqPath = reqPath.slice(0, -1);
    }

    // --- Security: Check Blacklist First ---
    if (isBlacklisted(reqPath)) {
        console.log(`Access denied (blacklist): ${reqPath}`);
        return res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
    }

    // --- Check for Directory Request (Serve default.md) ---
    const relativePath = reqPath.substring(1); // Path relative to DATA_DIR root
    const potentialDirPath = path.resolve(DATA_DIR, relativePath);

    try {
        // Security Check: Prevent access outside DATA_DIR for directory check
        if (!potentialDirPath.startsWith(DATA_DIR + path.sep) && potentialDirPath !== DATA_DIR) {
            console.log(`Path escape attempt prevented (directory check): ${reqPath}`);
            throw { code: 'ENOENT' }; // Treat as not found for security
        }

        const stats = await fs.stat(potentialDirPath);

        if (stats.isDirectory()) {
            // Path is a directory, attempt to serve its mandatory index file
            const categoryIndexPath = path.join(potentialDirPath, CATEGORY_INDEX_FILE);
            console.log(`Request for directory ${reqPath}. Attempting index: ${CATEGORY_INDEX_FILE}`);

            try {
                // Render the default.md file for the category
                const finalHtml = await renderMarkdownPage(categoryIndexPath, reqPath);
                return res.send(finalHtml);
            } catch (indexError) {
                if (indexError.code === 'ENOENT') {
                    // The MANDATORY default.md was not found
                    console.error(`CRITICAL: Index file '${CATEGORY_INDEX_FILE}' not found for directory ${reqPath}. This file is mandatory.`);
                    return res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
                } else {
                    // Error occurred while rendering an *existing* default.md
                    console.error(`Error rendering mandatory index file ${categoryIndexPath}:`, indexError);
                    return res.status(500).sendFile(NOT_FOUND_PAGE_PATH); // Internal server error
                }
            }
        }
        // If it's not a directory, continue below to treat as a file request...
    } catch (err) {
        // fs.stat failed, likely means path doesn't exist as dir. Expected for file requests.
        if (err.code !== 'ENOENT') {
           console.error(`Unexpected error checking path stats for ${potentialDirPath}:`, err);
        }
        // Proceed to check for the corresponding .md file
    }

    // --- Standard File Request (Serve specific .md file) ---
    const mdFilePath = path.resolve(DATA_DIR, relativePath + '.md');

    // Security Check: Prevent access outside DATA_DIR for file check
     if (!mdFilePath.startsWith(DATA_DIR + path.sep)) {
         console.log(`Path escape attempt prevented (file check): ${reqPath}`);
         return res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
     }

    // --- Attempt to Render the Specific Markdown File ---
    try {
        console.log(`Attempting to serve standard Markdown file: ${mdFilePath}`);
        const finalHtml = await renderMarkdownPage(mdFilePath, reqPath);
        res.send(finalHtml);
    } catch (error) {
        // Handle errors from renderMarkdownPage specifically
        if (error.code === 'ENOENT') {
            // The requested .md file itself wasn't found
            console.log(`Markdown file not found for ${reqPath} at ${mdFilePath}`);
            res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
        } else {
            // Other error during rendering (already logged inside renderMarkdownPage)
            console.error(`Unhandled error rendering standard file ${mdFilePath}. Check logs.`);
            res.status(500).sendFile(NOT_FOUND_PAGE_PATH);
        }
    }
});


/* ==================================
 * Server Initialization
 * ================================== */

// Load blacklist first, then ensure 404 page exists, then start listening
loadBlacklist().then(() => {
    fs.access(NOT_FOUND_PAGE_PATH)
        .then(() => {
            app.listen(PORT, () => {
                console.log("===============================================");
                console.log(`Markdown Server Started`);
                console.log(`Listening on: http://localhost:${PORT}`);
                console.log(`Content Root: ${DATA_DIR}`);
                console.log(`Templates:    ${TEMPLATE_DIR}`);
                console.log(`Public Dir:   ${PUBLIC_DIR}`);
                console.log(`Stylesheet:   /${CSS_STYLESHEET}`);
                console.log(`Blacklist:    ${BLACKLIST_PATH}`);
                console.log(`404 Page:     ${NOT_FOUND_PAGE_PATH}`);
                console.log("Using 'marked-highlight' with 'highlight.js' engine.");
                console.log("===============================================");
            });
        })
        .catch(_ => {
             // Handle case where 404 page itself is missing
             console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
             console.error(`FATAL ERROR: Custom 404 page not found at:`);
             console.error(NOT_FOUND_PAGE_PATH);
             console.error(`Please create this file before starting the server.`);
             console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
             process.exit(1); // Exit if 404 page is crucial and missing
        });
}).catch(error => {
    // Handle errors during initial blacklist loading
    console.error("FATAL ERROR during server initialization:", error);
    process.exit(1);
});