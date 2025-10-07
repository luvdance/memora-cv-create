const express = require('express');
const path = require('path');
const pdf = require('html-pdf');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 4000;

// Simple in-memory storage for PDFs. Now stores { buffer, filename }
const pdfStore = new Map();

// Middleware setup
app.use(cors()); 
app.use(express.json({ limit: '10mb' })); 

// --- UPDATED: Template Style Definitions for Server Injection ---
const TEMPLATE_STYLES = {
    'classic': `
        /* Classic Styles */
        .template-classic .resume h1{font-family: "Georgia", "Times New Roman", serif;}
        .template-classic .resume h2{font-family: "Georgia", "Times New Roman", serif;}
    `,
    'modern': `
        /* Modern Styles */
        .template-modern .resume h1{letter-spacing:.3px;}
        .template-modern .resume .section h2{border-bottom:2px solid #111827;}
        .template-modern .resume .item .top{color:#0f172a;}
        /* FIX: Increased top padding significantly to 25mm to ensure the header clears the accent bar and top page margin */
        .template-modern .resume {padding-top: 25mm !important;} 
        .template-modern .accent{height:6px; background:#111827; margin:-22mm -22mm 16px; border-radius:10px 10px 0 0;}
    `,
    'minimal': `
        /* Minimal Styles */
        /* FIX: Changed transparent background to a solid light grey (#f3f4f6) to ensure it renders in the PDF */
        .template-minimal .resume .section h2{border:none; background:#f3f4f6; padding:6px 8px; border-radius:6px;}
    `
    // Ensure all styles used by your templates are listed here
};
// --- END UPDATED ---

// Endpoint to prepare the PDF
app.post('/prepare-pdf', (req, res) => {
    // UPDATED: Extract the new 'personName' field from the request body
    const { html, personName } = req.body;
    
    // LOG ADDED: Display the received name for debugging frontend issues
    console.log(`[PDF Generator] Received Name: ${personName || 'Name not provided'}`); 
    
    if (!html) {
        return res.status(400).json({ error: 'Missing html in request body' });
    }

    // 1. Server logic: Retrieves the template name
    const templateName = req.query.template || 'classic'; 
    
    // LOG ADDED: Confirm which template is being processed
    console.log(`[PDF Generator] Preparing PDF for template: ${templateName}`); 

    // --- NEW: Filename generation based on personName ---
    let baseName = 'CV';
    if (personName && typeof personName === 'string' && personName.trim() !== '') {
        // Sanitize the name: replace spaces with underscores, remove special chars, and limit length
        baseName = personName.trim()
            .replace(/\s+/g, '_') 
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .substring(0, 50); 
    }
    
    const templateSuffix = templateName.charAt(0).toUpperCase() + templateName.slice(1);
    const uniqueId = uuidv4().substring(0, 8);

    // New filename structure: Name_TemplateName_ID.pdf
    const filename = `${baseName}_${templateSuffix}_${uniqueId}.pdf`;
    // --- END NEW ---
    
    // 2. Look up the specific template CSS snippet
    const styleSnippet = TEMPLATE_STYLES[templateName] || '';
    
    // 3. Inject the CSS into the HTML payload before </head>
    let finalHtml = html;
    if (styleSnippet) {
        const styleTag = `<style id="template-injection">${styleSnippet}</style>`;
        // This regex/string replacement finds the closing </head> tag and inserts the styles right before it.
        finalHtml = html.replace('</head>', `${styleTag}\n</head>`);
    }

    const id = uuidv4();
    
    // PDF creation happens here using the finalHtml (which now includes the styles)
    pdf.create(finalHtml, { 
        format: 'A4', 
        border: '15mm', 
        quality: 100,
        timeout: 30000 // 30 seconds timeout
    }).toBuffer((err, buffer) => {
        if (err) {
            console.error('❌ Error creating PDF with html-pdf:', err);
            return res.status(500).json({ error: 'Failed to create PDF using Webkit engine. Check server logs for details.' });
        }

        // Store the buffer AND the generated filename
        pdfStore.set(id, { buffer, filename });
        
        // PDF link expires after 10 minutes
        setTimeout(() => pdfStore.delete(id), 10 * 60 * 1000); 

        // Return a relative URL for download AND the filename
        const downloadUrl = `/download/${id}`;
        res.json({ id, downloadUrl, filename }); 
    });
});

// Endpoint to download the PDF
app.get('/download/:id', (req, res) => {
    const { id } = req.params;
    const data = pdfStore.get(id); 

    if (!data) return res.status(404).send('PDF not found or expired');

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${data.filename}"`
    });

    res.send(data.buffer); 
    pdfStore.delete(id); 
});

app.listen(PORT, () => console.log(`🚀 PDF API Server listening on http://localhost:${PORT}`));
