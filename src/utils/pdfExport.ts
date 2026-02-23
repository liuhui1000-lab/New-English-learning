import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Exports a DOM element to a PDF file using html2canvas and jsPDF.
 * This method supports Chinese characters by rendering the DOM to a canvas/image first.
 * 
 * @param elementId The ID of the DOM element to export
 * @param fileName The name of the resulting PDF file
 */
export async function exportToPDF(elementId: string, fileName: string = 'mistakes.pdf') {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id "${elementId}" not found.`);
        return;
    }

    try {
        let cloneMetrics: any = null;

        // 1. Capture the element as a canvas
        // We use a higher scale (2 or 3) for better resolution in the PDF
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: '#ffffff',
            // Ensure we capture the full scroll height if it's a long list
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
            // Optimization: Remove modern CSS colors that html2canvas cannot parse (lab, oklch)
            onclone: async (clonedDoc) => {
                // 1. Remove elements that shouldn't be printed
                const hiddenElements = clonedDoc.querySelectorAll('.print\\:hidden, .hidden');
                hiddenElements.forEach(el => el.remove());

                // 2. Nuke ALL style tags and link stylesheets to prevent html2canvas oklch crash & CORS fetch issues in Vercel.
                const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
                styles.forEach(s => s.remove());

                // 3. Clear problematic inline styles
                const allElements = clonedDoc.getElementsByTagName("*");
                for (let i = 0; i < allElements.length; i++) {
                    const el = allElements[i] as HTMLElement;
                    if (el.style) el.removeAttribute('style');
                }

                // 4. Inject a rock-solid, fully deterministic CSS block using pure HEX colors.
                // We also scale down the fonts (12px core) and spacing to make the PDF super dense.
                const printStyle = clonedDoc.createElement('style');
                printStyle.innerHTML = `
                    /* Base Reset */
                    * { 
                        box-sizing: border-box !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body, div, span, p, h1, h2, h3, h4, li, ul {
                        font-family: ui-sans-serif, system-ui, sans-serif !important;
                        margin: 0;
                        padding: 0;
                    }

                    /* Layout */
                    .flex { display: flex !important; }
                    .flex-col { flex-direction: column !important; }
                    .flex-1 { flex: 1 1 0% !important; }
                    .items-start { align-items: flex-start !important; }
                    .items-center { align-items: center !important; }
                    .justify-between { justify-content: space-between !important; }
                    
                    /* Spacing & Gaps (Compact for PDF) */
                    .gap-4 { gap: 0.5rem !important; }
                    .gap-3 { gap: 0.5rem !important; }
                    .gap-2 { gap: 0.25rem !important; }
                    .space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.5rem !important; }
                    .space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.25rem !important; }
                    .mt-1 { margin-top: 0.25rem !important; }
                    .mt-3 { margin-top: 0.5rem !important; }
                    .mt-4 { margin-top: 0.5rem !important; }
                    .mb-1 { margin-bottom: 0.25rem !important; }
                    .mb-2 { margin-bottom: 0.25rem !important; }
                    .mr-1 { margin-right: 0.25rem !important; }
                    .pt-4 { padding-top: 0.5rem !important; }
                    
                    /* Padding inside cards */
                    .p-5 { padding: 0.75rem !important; }
                    .p-3 { padding: 0.5rem !important; }
                    .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
                    .py-0\\.5 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
                    .px-3 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
                    .py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }

                    /* Borders & Backgrounds */
                    .bg-white { background-color: #ffffff !important; }
                    .bg-gray-50 { background-color: #f9fafb !important; }
                    .bg-indigo-50 { background-color: #eef2ff !important; }
                    .bg-green-50 { background-color: #f0fdf4 !important; }
                    .bg-red-50 { background-color: #fef2f2 !important; }
                    
                    .border { border: 1px solid #e5e7eb !important; }
                    .border-t { border-top: 1px solid #e5e7eb !important; }
                    .border-gray-100 { border-color: #f3f4f6 !important; }
                    .border-gray-200 { border-color: #e5e7eb !important; }
                    .border-indigo-500 { border-color: #6366f1 !important; }
                    
                    .rounded-xl { border-radius: 0.5rem !important; }
                    .rounded-lg { border-radius: 0.375rem !important; }
                    .rounded { border-radius: 0.25rem !important; }

                    /* Typography Colors */
                    .text-gray-900, h3 { color: #111827 !important; }
                    .text-gray-500 { color: #6b7280 !important; }
                    .text-gray-400 { color: #9ca3af !important; }
                    .text-indigo-600 { color: #4f46e5 !important; }
                    .text-green-600 { color: #16a34a !important; }
                    .text-red-500, .text-red-600 { color: #ef4444 !important; }
                    
                    /* Typography Sizes & Weights (Requested 12pt/12px size) */
                    .text-lg { font-size: 14px !important; line-height: 20px !important; }
                    .text-sm, .text-xs, body, p, div, span { font-size: 12px !important; line-height: 18px !important; }
                    .font-bold { font-weight: 700 !important; }
                    .font-medium { font-weight: 500 !important; }
                    .italic { font-style: italic !important; }
                    .uppercase { text-transform: uppercase !important; }
                    .tracking-wider { letter-spacing: 0.05em !important; }
                    .leading-relaxed { line-height: 1.6 !important; }
                    .line-through { text-decoration: line-through !important; }

                    /* Utilities */
                    .print\\:hidden, .hidden { display: none !important; }
                    svg { width: 14px !important; height: 14px !important; }
                    .w-3 { width: 12px !important; } .h-3 { height: 12px !important; }
                    .cursor-pointer { cursor: pointer !important; }
                    .transition { transition: none !important; }
                    
                    /* Core PDF Logic */
                    .mistake-card {
                        page-break-inside: avoid;
                        break-inside: avoid;
                        margin-bottom: 0.5rem !important;
                        position: relative;
                        overflow: hidden;
                    }
                `;
                clonedDoc.head.appendChild(printStyle);

                // Wait for layout browser reflow
                await new Promise(resolve => setTimeout(resolve, 150));

                const cloneEl = clonedDoc.getElementById(elementId);
                if (cloneEl) {
                    const cRect = cloneEl.getBoundingClientRect();
                    const cCards = Array.from(cloneEl.querySelectorAll('.mistake-card'));
                    cloneMetrics = {
                        height: cRect.height,
                        cards: cCards.map(c => {
                            const r = c.getBoundingClientRect();
                            return { top: r.top - cRect.top, bottom: r.bottom - cRect.top };
                        })
                    };
                }
            }
        });

        // Fallback to live DOM if clone measurement fails
        if (!cloneMetrics) {
            const containerRect = element.getBoundingClientRect();
            const cards = Array.from(element.querySelectorAll('.mistake-card'));
            cloneMetrics = {
                height: containerRect.height,
                cards: cards.map(c => {
                    const r = c.getBoundingClientRect();
                    return { top: r.top - containerRect.top, bottom: r.bottom - containerRect.top };
                })
            };
        }

        // 2. Convert canvas to image data
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // 3. Initialize jsPDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidthMM = pdf.internal.pageSize.getWidth();
        const pdfHeightMM = pdf.internal.pageSize.getHeight();

        // 4. Calculate dimensions and margins
        const marginMM = 15; // 15mm margins
        const contentWidthMM = pdfWidthMM - (marginMM * 2);
        const contentHeightMM = pdfHeightMM - (marginMM * 2);

        // Unified Coordinate System: Map everything to Canvas Pixels
        const canvasPxToMm = contentWidthMM / canvas.width;
        const pageHeightCanvasPx = contentHeightMM / canvasPxToMm;

        // Scale clone DOM dimensions up to canvas pixel dimensions
        const domToCanvasScale = canvas.height / cloneMetrics.height;
        const cardsInCanvas = cloneMetrics.cards.map((c: any) => ({
            top: c.top * domToCanvasScale,
            bottom: c.bottom * domToCanvasScale
        }));

        let currentOffsetPx = 0;
        const pageOffsetsPx = [];
        const maxCanvasHeight = canvas.height;

        while (currentOffsetPx < maxCanvasHeight) {
            pageOffsetsPx.push(currentOffsetPx);
            let nextOffsetPx = currentOffsetPx + pageHeightCanvasPx;

            if (nextOffsetPx >= maxCanvasHeight) break;

            let breakOffsetPx = nextOffsetPx;
            let foundBreak = false;

            for (const card of cardsInCanvas) {
                if (card.top < nextOffsetPx && card.bottom > nextOffsetPx) {
                    if (card.top > currentOffsetPx + (60 * domToCanvasScale)) {
                        breakOffsetPx = card.top - (15 * domToCanvasScale);
                        foundBreak = true;
                    }
                    break;
                }
            }

            if (!foundBreak) breakOffsetPx = nextOffsetPx;
            if (breakOffsetPx <= currentOffsetPx) breakOffsetPx = nextOffsetPx;
            currentOffsetPx = breakOffsetPx;
        }

        // 6. Draw PDF pages
        const imgWidthMM = contentWidthMM;
        const imgHeightMM = canvas.height * canvasPxToMm;

        for (let i = 0; i < pageOffsetsPx.length; i++) {
            if (i > 0) pdf.addPage();

            const offsetPx = pageOffsetsPx[i];
            const nextOffsetPx = (i < pageOffsetsPx.length - 1) ? pageOffsetsPx[i + 1] : maxCanvasHeight;

            const shiftYMM = offsetPx * canvasPxToMm;

            pdf.addImage(imgData, 'JPEG', marginMM, marginMM - shiftYMM, imgWidthMM, imgHeightMM);

            const printedHeightMM = (nextOffsetPx - offsetPx) * canvasPxToMm;
            if (printedHeightMM < contentHeightMM) {
                pdf.setFillColor(249, 250, 251); // Gray-50 mask for the card area
                pdf.rect(0, marginMM + printedHeightMM, pdfWidthMM, pdfHeightMM - (marginMM + printedHeightMM), 'F');
            }

            pdf.setFillColor(249, 250, 251); // Gray-50 mask for margins
            pdf.rect(0, 0, pdfWidthMM, marginMM, 'F');
            pdf.rect(0, pdfHeightMM - marginMM, pdfWidthMM, marginMM, 'F');
        }

        // 7. Save the PDF
        pdf.save(fileName);

        // Inject debug overlay so user can send logs
        const debugData = {
            elementScrollHeight: element.scrollHeight,
            elementOffsetHeight: element.offsetHeight,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            pxToMm: canvasPxToMm,
            pageHeightCanvasPx: pageHeightCanvasPx,
            pageOffsetsPx,
            cardsCount: cloneMetrics ? cloneMetrics.cards.length : 0,
            cloneHeight: cloneMetrics ? cloneMetrics.height : 0
        };

        const debugDiv = document.createElement('div');
        debugDiv.style.position = 'fixed';
        debugDiv.style.top = '0';
        debugDiv.style.left = '0';
        debugDiv.style.width = '100vw';
        debugDiv.style.height = '100vh';
        debugDiv.style.backgroundColor = 'rgba(0,0,0,0.9)';
        debugDiv.style.color = '#0f0';
        debugDiv.style.zIndex = '999999';
        debugDiv.style.overflow = 'auto';
        debugDiv.style.padding = '20px';
        debugDiv.innerHTML = `
            <button onclick="this.parentElement.remove()" style="padding:10px 20px; background:white; color:black; font-weight:bold; margin-bottom: 20px; border-radius: 8px;">关闭诊断日志</button>
            <h3 style="color:white; margin-bottom: 10px;">请将以下数据截图发给开发人员：</h3>
            <pre style="white-space: pre-wrap; word-wrap: break-word; font-size: 14px;">${JSON.stringify(debugData, null, 2)}</pre>
        `;
        document.body.appendChild(debugDiv);

    } catch (error: any) {
        console.error('PDF Export Error:', error);
        alert('导出失败: ' + (error.message || '未知错误'));
        throw error;
    }
}
