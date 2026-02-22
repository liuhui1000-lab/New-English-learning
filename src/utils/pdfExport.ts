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
            onclone: (clonedDoc) => {
                // 1. Remove all existing styles that might contain lab() or oklch()
                const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
                styles.forEach(s => s.remove());

                // 2. Inject a clean, Hex-only CSS for the PDF export
                const style = clonedDoc.createElement('style');
                style.innerHTML = `
                    * { 
                        box-sizing: border-box !important;
                        -webkit-print-color-adjust: exact !important;
                    }
                    body, div, span, p, h1, h2, h3, h4 {
                        font-family: sans-serif !important;
                        background-color: transparent !important;
                        color: #1f2937 !important; /* Gray-800 fallback */
                    }
                    #mistakes-list-container {
                        padding: 20px !important;
                        background-color: #ffffff !important;
                        display: block !important;
                    }
                    /* Layout */
                    .flex { display: flex !important; }
                    .flex-col { flex-direction: column !important; }
                    .gap-4 { gap: 1rem !important; }
                    .gap-2 { gap: 0.5rem !important; }
                    .flex-1 { flex: 1 1 0% !important; }
                    .items-start { align-items: flex-start !important; }
                    
                    /* Spacing */
                    .space-y-4 > * + * { margin-top: 1rem !important; }
                    .mt-1 { margin-top: 0.25rem !important; }
                    .mt-3 { margin-top: 0.75rem !important; }
                    .mt-4 { margin-top: 1rem !important; }
                    .mb-1 { margin-bottom: 0.25rem !important; }
                    .mb-2 { margin-bottom: 0.5rem !important; }
                    
                    /* Card Styles */
                    .bg-white { background-color: #ffffff !important; }
                    .rounded-xl { border-radius: 0.75rem !important; }
                    .rounded-lg { border-radius: 0.5rem !important; }
                    .rounded { border-radius: 0.25rem !important; }
                    .border { border: 1px solid #e5e7eb !important; }
                    .p-5 { padding: 1.25rem !important; }
                    .p-3 { padding: 0.75rem !important; }
                    
                    /* Tags and Colors (HEX ONLY) */
                    .bg-indigo-50 { background-color: #eef2ff !important; }
                    .text-indigo-600 { color: #4f46e5 !important; }
                    .bg-green-50 { background-color: #f0fdf4 !important; }
                    .text-green-600 { color: #16a34a !important; }
                    .bg-red-50 { background-color: #fef2f2 !important; }
                    .text-red-600 { color: #dc2626 !important; }
                    .bg-gray-50 { background-color: #f9fafb !important; }
                    .text-gray-900 { color: #111827 !important; }
                    .text-gray-500 { color: #6b7280 !important; }
                    .text-gray-400 { color: #9ca3af !important; }
                    
                    /* Typography */
                    .text-lg { font-size: 1.125rem !important; line-height: 1.75rem !important; }
                    .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
                    .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
                    .font-bold { font-weight: 700 !important; }
                    .font-medium { font-weight: 500 !important; }
                    .italic { font-style: italic !important; }
                    .uppercase { text-transform: uppercase !important; }
                    .tracking-wider { letter-spacing: 0.05em !important; }
                    .leading-relaxed { line-height: 1.625 !important; }
                    
                    /* Visibility */
                    .print\\:hidden, button, input { display: none !important; }
                    .hidden { display: none !important; }
                `;
                clonedDoc.head.appendChild(style);
            }
        });

        // 2. Convert canvas to image data
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // 3. Initialize jsPDF
        // 'p' for portrait, 'mm' for millimeters, 'a4' for size
        const pdf = new jsPDF('p', 'mm', 'a4');

        // A4 dimensions in mm
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Calculate image dimensions to fit the PDF page width
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        // 4. Add image to PDF, handling multiple pages if necessary
        // First page
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        // Additional pages
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        // 5. Save the PDF
        pdf.save(fileName);
    } catch (error) {
        console.error('PDF Export Error:', error);
        throw error;
    }
}
