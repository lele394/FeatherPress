const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { marked, Renderer } = require('marked');
const hljs = require('highlight.js');
const katex = require('katex');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuration ---
const DATA_DIR = path.resolve(__dirname, 'data');
const TEMPLATE_DIR = path.join(__dirname, 'template');
const PUBLIC_DIR = path.join(__dirname, 'public');
const BLACKLIST_PATH = path.join(__dirname, 'blacklist.json');
const HEADER_PATH = path.join(TEMPLATE_DIR, 'header.md');
const FOOTER_PATH = path.join(TEMPLATE_DIR, 'footer.md');
const LANDING_PAGE_PATH = path.join(PUBLIC_DIR, 'landing.md');
const NOT_FOUND_PAGE_PATH = path.join(PUBLIC_DIR, '404.html');
const CATEGORY_INDEX_FILE = 'default.md'; // Name of the index file for categories

let forbiddenRoutes = new Set();

// --- Helper Functions (loadBlacklist, processCustomTemplates, processLatex, isBlacklisted - unchanged) ---

async function loadBlacklist() {
    try {
        const data = await fs.readFile(BLACKLIST_PATH, 'utf8');
        const routes = JSON.parse(data);
        if (!Array.isArray(routes)) { throw new Error('Blacklist must be an array.'); }
        forbiddenRoutes = new Set(routes);
        console.log(`Blacklist loaded: ${routes.length} rules.`);
    } catch (error) {
        console.error('Error loading blacklist.json:', error.message);
        forbiddenRoutes = new Set();
    }
}

async function processCustomTemplates(markdownContent, basePathForTemplates) {
    // Regex slightly adjusted: ensures the capture group starts *after* the {
    // It still captures everything until the final non-greedy }}
    const templateRegex = /!\{\{([^}]+?)\}\{(.*?)\}\}/gs; // Note: Removed the extra '}' between capture groups in the regex pattern itself.
    let processedContent = markdownContent;
    let match;

    // Keep processing until no more template tags are found
    while ((match = templateRegex.exec(processedContent)) !== null) {
        // Groups:
        // match[0]: Full match !{{name}{json}}
        // match[1]: Template name (e.g., "custom")
        // match[2]: JSON content string (e.g., ' "name": "Blog Reader" ') - note potential surrounding whitespace
        const [fullMatch, templateName, rawJsonDataString] = match;
        let templateData = {};

        // Trim the captured JSON string FIRST
        const jsonDataString = rawJsonDataString.trim();

        // Add debugging to see *exactly* what's being parsed
        console.log(`DEBUG: Template Tag Found: ${fullMatch}`);
        console.log(`DEBUG: Captured Template Name: >>${templateName}<<`);
        console.log(`DEBUG: Captured Raw JSON String: >>${rawJsonDataString}<<`);
        console.log(`DEBUG: Trimmed JSON String for Parsing: >>${jsonDataString}<<`);


        try {
            // Allow empty JSON object {} or completely empty content "" after trimming
            if (jsonDataString !== '{}' && jsonDataString !== '') {
                 // Prepend and append braces if the trimmed string isn't already enclosed
                 // This makes the syntax slightly more flexible: !{{custom "name":"value"}} is also possible
                 let stringToParse = jsonDataString;
                 if (!stringToParse.startsWith('{') || !stringToParse.endsWith('}')) {
                    stringToParse = `{${stringToParse}}`;
                    console.log(`DEBUG: Auto-adding braces: >>${stringToParse}<<`);
                 }
                 templateData = JSON.parse(stringToParse);
            } else if (jsonDataString === '{}') {
                // Handle explicit empty object
                templateData = {};
                 console.log(`DEBUG: Parsing explicit empty object {}`);
            } else {
                 // Handle case where it was just whitespace between outer braces: !{{custom{   }}}
                 console.log(`DEBUG: Ignoring empty or whitespace-only JSON content.`);
                 templateData = {};
            }

        } catch (e) {
            console.warn(`Warning: Invalid JSON in template tag ${fullMatch}. Content: >>${jsonDataString}<<. Error: ${e.message}. Skipping injection.`);
            processedContent = processedContent.replace(fullMatch, `<!-- Invalid JSON in template ${templateName}: ${e.message} -->`);
            templateRegex.lastIndex = 0; // Reset regex index after replacement
            continue; // Move to next potential match
        }

        const templateFilePath = path.join(TEMPLATE_DIR, `${templateName}.md`);

        try {
            let templateContent = await fs.readFile(templateFilePath, 'utf8');

            // Recursively process templates within the loaded template first
            templateContent = await processCustomTemplates(templateContent, templateFilePath);

            // Replace placeholders {{key}} in the template content
            for (const key in templateData) {
                const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                templateContent = templateContent.replace(placeholder, templateData[key]);
            }

            // Replace the original template tag with the processed template content
            processedContent = processedContent.replace(fullMatch, templateContent);
            templateRegex.lastIndex = 0; // Reset regex index after replacement

        } catch (error) {
            // Handle template file not found errors specifically
            if (error.code === 'ENOENT') {
                 console.warn(`Warning: Template file not found: ${templateFilePath}. Skipping injection for ${fullMatch}.`);
                 processedContent = processedContent.replace(fullMatch, `<!-- Template file ${templateName}.md not found -->`);
            } else {
                console.warn(`Warning: Error reading template file ${templateFilePath}: ${error.message}. Skipping injection for ${fullMatch}.`);
                processedContent = processedContent.replace(fullMatch, `<!-- Error reading template ${templateName}.md -->`);
            }
             templateRegex.lastIndex = 0; // Reset regex index after replacement
        }
    }

    return processedContent;
}


function processLatex(markdownContent) {
    // (Code identical to previous version)
    markdownContent = markdownContent.replace(/\$(.+?)\$/g, (match, latex) => {
        try { return katex.renderToString(latex, { throwOnError: false, displayMode: false }); }
        catch (e) { console.warn(`KaTeX inline error: ${e.message}`); return `<code>${latex}</code>`; }
    });
     markdownContent = markdownContent.replace(/\$\$([\s\S]+?)\$\$/g, (match, latex) => {
        try { return katex.renderToString(latex, { throwOnError: false, displayMode: true }); }
        catch (e) { console.warn(`KaTeX block error: ${e.message}`); return `<pre><code>${latex}</code></pre>`; }
    });
    return markdownContent;
}

function isBlacklisted(reqPath) {
    // (Code identical to previous version)
    if (forbiddenRoutes.has(reqPath)) return true;
    for (const forbidden of forbiddenRoutes) {
        if (forbidden.endsWith('/') && reqPath.startsWith(forbidden)) return true;
    }
    return false;
}

// --- Centralized Markdown Rendering Function (renderMarkdownPage - unchanged) ---
async function renderMarkdownPage(markdownFilePath, reqPath) {
    try {
        // (Code identical to previous version)
        const mdFileDir = path.dirname(markdownFilePath);
        const [headerMd, footerMd, mainMd] = await Promise.all([
            fs.readFile(HEADER_PATH, 'utf8').catch(() => ''),
            fs.readFile(FOOTER_PATH, 'utf8').catch(() => ''),
            fs.readFile(markdownFilePath, 'utf8')
        ]);

        let processedMainMd = await processCustomTemplates(mainMd, markdownFilePath);
        const processedHeaderMd = await processCustomTemplates(headerMd, HEADER_PATH);
        const processedFooterMd = await processCustomTemplates(footerMd, FOOTER_PATH);
        let fullMarkdown = `${processedHeaderMd}\n\n${processedMainMd}\n\n${processedFooterMd}`;
        fullMarkdown = processLatex(fullMarkdown);

        const renderer = new Renderer();
        renderer.image = (href, title, text) => {
            let resolvedHref = href;
            try {
                if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/')) {
                     const absoluteImagePath = path.resolve(mdFileDir, href);
                     if (absoluteImagePath.startsWith(DATA_DIR) || absoluteImagePath.startsWith(PUBLIC_DIR)) {
                        const serverRelativePath = path.relative(__dirname, absoluteImagePath);
                        resolvedHref = path.join('/assets', serverRelativePath).replace(/\\/g, '/');
                     } else { console.warn(`Image path escape: ${href}`); resolvedHref = '#'; }
                }
            } catch(e){ console.error("Err img path:", e); resolvedHref = '#';}
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
                    } else { console.warn(`Asset link path escape: ${href}`); resolvedHref = '#'; }
                }
            } catch(e){ console.error("Err link path:", e); resolvedHref = '#';}
            return Renderer.prototype.link.call(renderer, resolvedHref, title, text);
        };

        marked.setOptions({ renderer, highlight: function (code, lang) { /* ... */ }, /* other options */ });
         marked.setOptions({
             renderer: renderer,
             highlight: function (code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                try { return hljs.highlight(code, { language, ignoreIllegals: true }).value; }
                catch (error) { console.error(`Highlight err: ${error}`); return hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value; }
            },
            pedantic: false, gfm: true, breaks: false, sanitize: false,
            smartLists: true, smartypants: false, xhtml: false
        });

        const htmlContent = marked.parse(fullMarkdown);
        const pageTitle = path.basename(reqPath) || 'Home';
        const finalHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css" integrity="sha384-zh0CIslj+VczCZtlzBcjt5ppRcsAmDnRem7ESsYwWwg3m/OaJ2l4x7YBZl9Kxxib" crossorigin="anonymous">

    <!-- The loading of KaTeX is deferred to speed up page rendering -->
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js" integrity="sha384-Rma6DA2IPUwhNxmrB/7S3Tno0YY7sFu9WSYMCuulLhIqYSGZ2gKCJWIqhBWqMQfh" crossorigin="anonymous"></script>

    <!-- To automatically render math in text elements, include the auto-render extension: -->
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js" integrity="sha384-hCXGrW6PitJEwbkoStFjeJxv+fSOOQKOPbJxSfM6G5sWZjAyWhXiTIIAmQqnlLlh" crossorigin="anonymous"
        onload="renderMathInElement(document.body);"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
</head>
<body>
    <div class="container">
        ${htmlContent}
    </div>
</body>
</html>`;
        return finalHtml;

    } catch (error) {
        if (error.code === 'ENOENT' && error.path === markdownFilePath) { throw error; }
        console.error(`Error rendering page ${markdownFilePath}:`, error);
        throw new Error('Internal Server Error during rendering');
    }
}

// --- Middleware (unchanged) ---
// Serve favicon specifically
app.use('/favicon.ico', express.static(path.join(PUBLIC_DIR, 'favicon.ico'), { fallthrough: false }));

app.use('/style.css', express.static(path.join(PUBLIC_DIR, 'style.css'), { fallthrough: false }));
app.use('/assets', express.static(__dirname, { fallthrough: false }));


// --- Route Handlers ---

// Landing page route (unchanged)
app.get('/', async (req, res) => {
    try {
        console.log(`Serving landing page: ${LANDING_PAGE_PATH}`);
        const finalHtml = await renderMarkdownPage(LANDING_PAGE_PATH, '/');
        res.send(finalHtml);
    } catch (error) {
         console.error(`Error serving landing page ${LANDING_PAGE_PATH}:`, error);
         try { await fs.access(NOT_FOUND_PAGE_PATH); res.status(500).sendFile(NOT_FOUND_PAGE_PATH); }
         catch (e404) { res.status(500).send('Internal Server Error and 404 page missing.'); }
    }
});

// *** UPDATED Generic route handler ***
app.get('*', async (req, res) => {
    let reqPath = req.path;

    // Normalize path: remove trailing slash unless it's the root
    if (reqPath !== '/' && reqPath.endsWith('/')) {
        reqPath = reqPath.slice(0, -1);
    }

    // 1. Check blacklist
    if (isBlacklisted(reqPath)) {
        console.log(`Access denied (blacklist): ${reqPath}`);
        return res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
    }

    // 2. Check if the path corresponds to a directory within DATA_DIR
    const relativePath = reqPath.substring(1); // e.g., 'blog' or 'tutorials/advanced'
    const potentialDirPath = path.resolve(DATA_DIR, relativePath);

    try {
        // Security check: Ensure resolved path is within DATA_DIR
        if (!potentialDirPath.startsWith(DATA_DIR + path.sep) && potentialDirPath !== DATA_DIR) {
            console.log(`Path escape attempt (directory check): ${reqPath}`);
            throw { code: 'ENOENT' }; // Treat as not found for security
        }

        const stats = await fs.stat(potentialDirPath);

        if (stats.isDirectory()) {
            // It's a directory! Try to serve the category index file (default.md)
            const categoryIndexPath = path.join(potentialDirPath, CATEGORY_INDEX_FILE);
            console.log(`Request for directory ${reqPath}. Attempting index: ${categoryIndexPath}`);

            try {
                const finalHtml = await renderMarkdownPage(categoryIndexPath, reqPath);
                return res.send(finalHtml); // Serve the rendered default.md
            } catch (indexError) {
                if (indexError.code === 'ENOENT') {
                    console.log(`Index file '${CATEGORY_INDEX_FILE}' not found for directory ${reqPath} at ${categoryIndexPath}`);
                    // Mandatory: If default.md is missing for a directory, it's a 404 for that directory path.
                    return res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
                } else {
                    // Error rendering an *existing* default.md
                    console.error(`Error rendering index file ${categoryIndexPath}:`, indexError);
                    // Display 404 page, but log as a server error
                    return res.status(500).sendFile(NOT_FOUND_PAGE_PATH);
                }
            }
        }
        // If it's not a directory, fall through to standard file handling below...
    } catch (err) {
        // fs.stat failed (path likely doesn't exist as a directory *or* file)
        // or security check threw ENOENT. This is expected for '/blog/post1' type requests.
        // No direct action needed here, just proceed to check for the .md file.
        if (err.code !== 'ENOENT') {
           console.error(`Unexpected error checking path ${potentialDirPath}:`, err); // Log other fs errors
        }
    }

    // 3. Standard file handling: Assume it's a request for a specific .md file
    const mdFilePath = path.resolve(DATA_DIR, relativePath + '.md');

    // Security check: Ensure resolved .md path is within DATA_DIR
     if (!mdFilePath.startsWith(DATA_DIR + path.sep)) {
         console.log(`Path escape attempt (file check): ${reqPath}`);
         return res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
     }

    try {
        console.log(`Attempting standard Markdown file: ${mdFilePath}`);
        const finalHtml = await renderMarkdownPage(mdFilePath, reqPath);
        res.send(finalHtml);
    } catch (error) {
        // Handle errors from rendering the standard .md file
        if (error.code === 'ENOENT') {
            console.log(`Markdown file not found for ${reqPath} at ${mdFilePath}`);
            res.status(404).sendFile(NOT_FOUND_PAGE_PATH);
        } else {
            console.error(`Error rendering standard file ${mdFilePath}:`, error);
            res.status(500).sendFile(NOT_FOUND_PAGE_PATH);
        }
    }
});


// --- Server Start (unchanged) ---
loadBlacklist().then(() => {
    fs.access(NOT_FOUND_PAGE_PATH)
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server listening on http://localhost:${PORT}`);
                // ... (rest of the startup logs)
                 console.log(`Category index file: '${CATEGORY_INDEX_FILE}'`);
            });
        })
        .catch(err => {
             console.error(`FATAL: Custom 404 page not found at ${NOT_FOUND_PAGE_PATH}.`);
             process.exit(1);
        });
}).catch(error => {
    console.error("Failed to initialize server:", error);
    process.exit(1);
});