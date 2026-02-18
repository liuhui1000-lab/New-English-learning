/**
 * Utility to stitch multiple base64 images into a single vertical image.
 * Used to reduce OCR API calls by batching multiple handwriting inputs into one request.
 */

interface StitchedImageInput {
    id: string;
    dataUrl: string;
}

export const stitchImages = (images: StitchedImageInput[], quality = 0.6): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (images.length === 0) {
            resolve("");
            return;
        }

        const loadedImages: HTMLImageElement[] = [];
        let loadedCount = 0;

        // 1. Load all images first to get dimensions
        images.forEach((item, index) => {
            const img = new Image();
            img.onload = () => {
                loadedImages[index] = img; // Keep order
                loadedCount++;
                if (loadedCount === images.length) {
                    processStitching();
                }
            };
            img.onerror = (err) => reject(err);
            img.src = item.dataUrl;
        });

        const processStitching = () => {
            try {
                // 2. Calculate dimensions
                // Increase width to 1024 to preserve handwriting details (was 600)
                const maxWidth = 1024;
                let totalHeight = 0;
                const padding = 80; // More spacing to separate questions clearly

                loadedImages.forEach(img => {
                    // Calculate scaled height to fit maxWidth
                    // If image is smaller than maxWidth, we still scale UP to ensure uniform width
                    // This helps small handwriting become bigger.
                    const scale = maxWidth / img.width;
                    const scaledHeight = img.height * scale;
                    totalHeight += scaledHeight + padding;
                });

                // 3. Create Canvas
                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = totalHeight;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error("Failed to get stitching canvas context"));
                    return;
                }

                // Fill white background
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 4. Draw Images & Separators
                let currentY = 0;

                loadedImages.forEach((img, i) => {
                    const originalItem = images[i];

                    // Draw Separator/Marker (Machine Readable)
                    // We use a distinct format: [[ID:question_id]]
                    // Use Dark Gray - Make it smaller relative to canvas width so it doesn't dominate?
                    // Actually, bigger is better for OCR.
                    ctx.fillStyle = '#444444';
                    ctx.font = 'bold 24px monospace'; // Larger font
                    ctx.textBaseline = 'top';
                    ctx.fillText(`[[ID:${originalItem.id}]]`, 20, currentY + 20);

                    // REMOVED: Dashed line which was triggering "Table Detection" (Layout Analysis)
                    // Just use whitespace.

                    const contentStartY = currentY + 60; // More gap after ID

                    // Draw Image (Scaled)
                    const scale = maxWidth / img.width;
                    // Limit max height to prevent extremely tall images
                    // But usually we want full content.
                    const scaledHeight = img.height * scale;

                    ctx.drawImage(img, 0, contentStartY, maxWidth, scaledHeight);

                    currentY += scaledHeight + padding;
                });

                // 5. Export Stitched Image
                // Revert to JPEG (High Quality 0.95) for maximum clarity
                const resultDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                resolve(resultDataUrl);

            } catch (error) {
                reject(error);
            }
        };
    });
};

/**
 * Parses the OCR result text to extract answers based on the stitched markers.
 * Expected format in text: "[[ID:xxx]] ...answer... [[ID:yyy]] ...answer..."
 */
export const parseStitchedOCRResult = (fullText: string): Record<string, string> => {
    const results: Record<string, string> = {};

    // Regex to match ID markers: supports [[ID:xxx]] or [ID:xxx] or [[ID:xxx]
    // Capture group 1 is the UUID
    const markerRegex = /(?:\[\[|\[)ID:([a-fA-F0-9\-]+)(?:\]\]|\])/g;

    let match;
    const matches: { id: string, index: number, length: number }[] = [];

    // 1. Find all marker positions
    while ((match = markerRegex.exec(fullText)) !== null) {
        matches.push({
            id: match[1],
            index: match.index,
            length: match[0].length
        });
    }

    // 2. Extract content between markers
    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const next = matches[i + 1];

        // Content starts after current marker
        const start = current.index + current.length;
        // Content ends at next marker start (or end of string)
        const end = next ? next.index : fullText.length;

        let content = fullText.substring(start, end);

        // Clean up content
        content = content.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML
        content = content.trim();

        // Remove the markers themselves if they appear in content (double safety)
        content = content.replace(/(?:\[\[|\[)ID:([a-fA-F0-9\-]+)(?:\]\]|\])/g, "");

        // Remove common OCR artifacts like underscores or dashes
        content = content.replace(/^[-_—]{3,}/, '').trim();

        if (current.id) {
            results[current.id] = content;
        }
    }

    return results;
};
