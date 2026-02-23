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

                // 2. Safely replace oklch/lab in all <style> tags without destroying layout
                const styleTags = clonedDoc.querySelectorAll('style');
                styleTags.forEach(style => {
                    if (style.innerHTML) {
                        // Fallback all oklch/lab colors to a generic gray or primary color to prevent html2canvas crash
                        style.innerHTML = style.innerHTML.replace(/(oklch|lab)\([^)]+\)/g, '#6b7280');
                    }
                });

                // 3. Fetch remote stylesheets, scrub them of oklch/lab, and inject them as safe <style> tags
                const linkTags = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
                for (let i = 0; i < linkTags.length; i++) {
                    const link = linkTags[i] as HTMLLinkElement;
                    try {
                        const href = link.href;
                        if (href) {
                            const res = await fetch(href);
                            let cssText = await res.text();
                            cssText = cssText.replace(/(oklch|lab)\([^)]+\)/g, '#6b7280');

                            const newStyle = clonedDoc.createElement('style');
                            newStyle.innerHTML = cssText;
                            clonedDoc.head.appendChild(newStyle);
                        }
                    } catch (e) {
                        console.warn('Failed to fetch stylesheet:', link.href, e);
                    }
                    link.remove(); // Remove the original remote link to prevent html2canvas from re-fetching and crashing
                }

                // 4. Scan all elements for problematic inline styles
                const allElements = clonedDoc.getElementsByTagName("*");
                for (let i = 0; i < allElements.length; i++) {
                    const el = allElements[i] as HTMLElement;
                    if (el.style) {
                        const styleText = el.getAttribute('style') || '';
                        if (styleText.includes('lab(') || styleText.includes('oklch(')) {
                            el.removeAttribute('style');
                        }
                    }
                }

                // 5. Inject final print fixes
                const printStyle = clonedDoc.createElement('style');
                printStyle.innerHTML = `
                    * { 
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .mistake-card {
                        page-break-inside: avoid;
                        break-inside: avoid;
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
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, marginMM + printedHeightMM, pdfWidthMM, pdfHeightMM - (marginMM + printedHeightMM), 'F');
            }

            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, pdfWidthMM, marginMM, 'F');
            pdf.rect(0, pdfHeightMM - marginMM, pdfWidthMM, marginMM, 'F');
        }

        // 7. Save the PDF
        pdf.save(fileName);

    } catch (error: any) {
        console.error('PDF Export Error:', error);
        alert('导出失败: ' + (error.message || '未知错误'));
        throw error;
    }
}
