export async function verifyQrisSignature(payloadText: string, signatureHeader: string, secretKey: string): Promise<boolean> {
    const encoder = new TextEncoder();
    
    // Import API Key sebagai Secret Key
    const key = await crypto.subtle.importKey(
        'raw', 
        encoder.encode(secretKey), 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign', 'verify']
    );
    
    // Buat signature dari payload yang diterima
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadText));
    
    // Konversi ArrayBuffer ke Hexadecimal string
    const hexSignature = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
        
    // Validasi perbandingan waktu konstan (mencegah timing attack)
    if (hexSignature.length !== signatureHeader.length) return false;
    
    let isMatch = true;
    for (let i = 0; i < hexSignature.length; i++) {
        if (hexSignature[i] !== signatureHeader[i]) {
            isMatch = false;
        }
    }
    
    return isMatch;
}
