const PLATFORM_FEE_RATE = 0.10; // 10%

/**
 * Calculate platform fee and net amount.
 * @param {number} gross - total payment amount
 * @returns {{ fee: number, net: number }}
 */
function calculateFee(gross) {
    const fee = parseFloat((gross * PLATFORM_FEE_RATE).toFixed(2));
    const net = parseFloat((gross - fee).toFixed(2));
    return { fee, net };
}

module.exports = { calculateFee, PLATFORM_FEE_RATE };
