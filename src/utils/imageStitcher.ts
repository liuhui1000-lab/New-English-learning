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
                // Standardize width to 600px (Closer to typical handwriting width, less scaling artifacts)
                // Draw each item
                // Increase height to prevent cramping
                const itemHeight = 200;
                const maxWidth = 600;
                let totalHeight = 0;
                const padding = 40; // Moderate spacing

                loadedImages.forEach(img => {
                    // Calculate scaled height to fit maxWidth
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
                    // Use Dark Gray instead of Black to reduce contrast dominance
                    ctx.fillStyle = '#444444';
                    ctx.font = 'bold 20px monospace';
                    ctx.textBaseline = 'top';
                    ctx.fillText(`[[ID:${originalItem.id}]]`, 10, currentY + 10);

                    // REMOVED: Dashed line which was triggering "Table Detection" (Layout Analysis)
                    // Just use whitespace.

                    const contentStartY = currentY + 50;

                    // Draw Image (Scaled)
                    const scale = maxWidth / img.width;
                    // Limit max height to prevent extremely tall images
                    // But usually we want full content.
                    const scaledHeight = img.height * scale;

                    ctx.drawImage(img, 0, contentStartY, maxWidth, scaledHeight);

                    currentY += scaledHeight + padding;
                });

                // 5. Export Stitched Image
                // Revert to JPEG (High Quality 0.8) to comply with User Request & Payload Limits
                const resultDataUrl = canvas.toDataURL('image/jpeg', 0.8);
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
