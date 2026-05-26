const HITSTER_URL = 'https://wilgoy23.github.io/MyHitster';

async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildQrUrl(previewUrl, cardHash) {
    const encoded = btoa(previewUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${HITSTER_URL}/index.html?id=${cardHash}&preview=${encoded}`;
}

// Generates and downloads the PDF.
// onProgress(message) is called with status strings during generation.
export async function generatePDF(tracks, onProgress = () => {}) {
    const playableTracks = tracks.filter(t => t.previewUrl);
    if (!playableTracks.length) return;

    const { jsPDF } = window.jspdf;
    const pageW = 612, pageH = 792;
    const marginX = 50, marginY = 50;
    const rows = 5, cols = 3;
    const perPage = rows * cols;
    const cardW = (pageW - 2 * marginX) / cols;
    const cardH = (pageH - 2 * marginY) / rows;
    const qrSize = Math.min(cardW, cardH) * 0.8;

    const qrDataUrls = [];
    for (let i = 0; i < playableTracks.length; i++) {
        onProgress(`Generating QR code ${i + 1} / ${playableTracks.length}…`);
        const track  = playableTracks[i];
        const hex    = await sha256hex(track.previewUrl);
        const qrUrl  = buildQrUrl(track.previewUrl, hex.substring(0, 12));
        try {
            qrDataUrls.push(await QRCode.toDataURL(qrUrl, { width: 300, margin: 2, errorCorrectionLevel: 'L' }));
        } catch (e) {
            console.error('QR error:', e);
            qrDataUrls.push(null);
        }
    }

    onProgress('Rendering PDF…');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    function drawGrid() {
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        for (let r = 0; r <= rows; r++) {
            const y = pageH - marginY - r * cardH;
            doc.line(marginX, y, pageW - marginX, y);
        }
        for (let c = 0; c <= cols; c++) {
            const x = marginX + c * cardW;
            doc.line(x, marginY, x, pageH - marginY);
        }
    }

    function drawGuides() {
        doc.setDrawColor(180);
        doc.setLineWidth(0.3);
        [
            [0, pageH - marginY, 15, pageH - marginY],
            [marginX, pageH, marginX, pageH - 15],
            [pageW - 15, pageH - marginY, pageW, pageH - marginY],
            [pageW - marginX, pageH, pageW - marginX, pageH - 15],
            [0, marginY, 15, marginY],
            [marginX, 0, marginX, 15],
            [pageW - 15, marginY, pageW, marginY],
            [pageW - marginX, 0, pageW - marginX, 15],
        ].forEach(([x1, y1, x2, y2]) => doc.line(x1, y1, x2, y2));
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
    }

    function wrappedText(text, cx, y, maxW, size) {
        doc.setFontSize(size);
        const words = text.split(' ');
        const lines = [];
        let cur = '';
        for (const w of words) {
            const test = cur ? `${cur} ${w}` : w;
            if (doc.getTextWidth(test) <= maxW) { cur = test; }
            else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        const lh = size * 1.3;
        for (const line of lines) { doc.text(line, cx, y, { align: 'center' }); y += lh; }
        return lines.length * lh;
    }

    const totalPages = Math.ceil(playableTracks.length / perPage);

    for (let page = 0; page < totalPages; page++) {
        const start = page * perPage;
        const end   = Math.min(start + perPage, playableTracks.length);

        // QR page
        if (page > 0) doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');
        drawGuides(); drawGrid();
        doc.setFontSize(7); doc.setTextColor(100);
        doc.text(`QR page ${page + 1}/${totalPages}`, pageW - marginX, 15, { align: 'right' });

        for (let i = start; i < end; i++) {
            const rel = i - start;
            const row = Math.floor(rel / cols);
            const col = rel % cols;
            const x   = marginX + col * cardW + (cardW - qrSize) / 2;
            const y   = pageH - marginY - row * cardH - (cardH + qrSize) / 2;
            if (qrDataUrls[i]) doc.addImage(qrDataUrls[i], 'PNG', x, y, qrSize, qrSize);
        }

        // Info page — columns mirrored for duplex printing
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');
        drawGuides(); drawGrid();
        doc.setFontSize(7); doc.setTextColor(100);
        doc.text(`Info page ${page + 1}/${totalPages}`, pageW - marginX, 15, { align: 'right' });

        for (let i = start; i < end; i++) {
            const rel    = i - start;
            const row    = Math.floor(rel / cols);
            const col    = rel % cols;
            const mirCol = (cols - 1) - col;
            const track  = playableTracks[i];

            const cx      = marginX + mirCol * cardW + cardW / 2;
            const cellTop = pageH - marginY - (row + 1) * cardH;
            let   y       = cellTop + cardH * 0.15;
            const textW   = cardW * 0.88;

            doc.setTextColor(0);
            doc.setFont('helvetica', 'bold');
            y += wrappedText(track.artist, cx, y, textW, 10) + 5;
            doc.setFont('helvetica', 'normal');
            y += wrappedText(track.name, cx, y, textW, 8.5) + 8;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text(track.year, cx, y, { align: 'center' });
        }
    }

    doc.save('Hitster_cards.pdf');
}
