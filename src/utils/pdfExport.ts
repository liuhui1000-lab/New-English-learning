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
                const style = clonedDoc.createElement('style');
                style.innerHTML = `
                    * { 
                        color: inherit !important; 
                        background-color: transparent !important;
                    }
                    div, span, button, h1, h2, h3, h4, p {
                         border-color: #e5e7eb !important;
                    }
                    .bg-indigo-600 { background-color: #4f46e5 !important; }
                    .text-indigo-600 { color: #4f46e5 !important; }
                    .bg-green-50 { background-color: #f0fdf4 !important; }
                    .text-green-600 { color: #16a34a !important; }
                    .bg-red-50 { background-color: #fef2f2 !important; }
                    .text-red-600 { color: #dc2626 !important; }
                    .bg-indigo-50 { background-color: #eef2ff !important; }
                    .bg-gray-50 { background-color: #f9fafb !important; }
                    .text-gray-900 { color: #111827 !important; }
                    .text-gray-500 { color: #6b7280 !important; }
                    .border-gray-200 { border-color: #e5e7eb !important; }
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
