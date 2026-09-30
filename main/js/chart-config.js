/**
 * iSpend Chart Configurations (Using Chart.js with Offline SVG Fallback)
 */

let categoryChartInstance = null;

/**
 * Khởi tạo biểu đồ cơ cấu chi tiêu (Doughnut Chart)
 * @param {string} canvasId 
 * @param {Array} labels - Danh sách các danh mục có chi tiêu
 * @param {Array} data - Số tiền chi tiêu
 * @param {Array} colors - Mảng màu tương ứng
 */
function initCategoryDoughnutChart(canvasId, labels, data, colors) {
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    const container = canvasEl.parentElement;

    // KIỂM TRA NẾU KHÔNG CÓ THƯ VIỆN CHART.JS (CHẠY OFFLINE)
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js is not loaded. Using offline SVG fallback for category chart.");
        canvasEl.style.display = 'none';
        
        let svgWrapper = container.querySelector('.svg-chart-wrapper');
        if (!svgWrapper) {
            svgWrapper = document.createElement('div');
            svgWrapper.className = 'svg-chart-wrapper';
            svgWrapper.style.width = '100%';
            svgWrapper.style.height = '100%';
            svgWrapper.style.display = 'flex';
            svgWrapper.style.justifyContent = 'center';
            svgWrapper.style.alignItems = 'center';
            container.appendChild(svgWrapper);
        } else {
            svgWrapper.style.display = 'flex';
        }
        
        drawSVGDoughnutChart(svgWrapper, labels, data, colors);
        return;
    }

    // Nếu có Chart.js, ẩn SVG wrapper (nếu có) và hiện canvas
    const svgWrapper = container.querySelector('.svg-chart-wrapper');
    if (svgWrapper) svgWrapper.style.display = 'none';
    canvasEl.style.display = 'block';

    const ctx = canvasEl.getContext('2d');
    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    if (!data || data.length === 0 || data.reduce((a, b) => a + b, 0) === 0) {
        labels = ['Chưa có chi tiêu'];
        data = [1];
        colors = ['rgba(255, 255, 255, 0.1)'];
    }

    // BIỂU ĐỒ HÌNH TRÒN ĐẦY ĐỦ VỚI VIỀN TRẮNG PHÂN CÁCH (PIE CHART)
    categoryChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2.5,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: 0,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.label === 'Chưa có chi tiêu') return ' Chưa có chi tiêu';
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const val = context.parsed;
                            const pct = ((val / total) * 100).toFixed(1) + '%';
                            return ` ${context.label}: ${formatCurrency(val)} (${pct})`;
                        }
                    },
                    backgroundColor: '#2c2c2e',
                    padding: 10,
                    cornerRadius: 8
                }
            }
        }
    });
}

/**
 * Vẽ biểu đồ hình tròn đầy đủ bằng SVG (Offline Fallback)
 */
function drawSVGDoughnutChart(wrapper, labels, data, colors) {
    const width = 170;
    const height = 170;
    const radius = 38;
    const strokeWidth = 76; // Bằng 2x radius -> tạo hình tròn đặc full 100%
    const cx = width / 2;
    const cy = height / 2;
    const circumference = 2 * Math.PI * radius;
    
    let total = data ? data.reduce((a, b) => a + b, 0) : 0;
    
    if (total === 0 || !labels || labels.length === 0) {
        wrapper.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
                <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="${strokeWidth}" />
                <text x="${cx}" y="${cy + 4}" fill="rgba(255,255,255,0.4)" font-size="10" text-anchor="middle" font-family="Plus Jakarta Sans">Chưa có chi tiêu</text>
            </svg>
        `;
        return;
    }
    
    let currentOffset = 0;
    let segmentsHtml = '';
    
    labels.forEach((label, index) => {
        const val = data[index];
        const percent = val / total;
        const strokeLength = percent * circumference;
        const strokeOffset = circumference - currentOffset;
        currentOffset += strokeLength;
        
        const color = colors[index] || '#8e8e93';
        
        segmentsHtml += `
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" 
                    stroke-width="${strokeWidth}" 
                    stroke-dasharray="${strokeLength} ${circumference}" 
                    stroke-dashoffset="${-strokeOffset + strokeLength}"
                    transform="rotate(-90 ${cx} ${cy})"
                    style="transition: stroke-width 0.2s; cursor: pointer;">
                <title>${label}: ${formatCurrency(val)} (${(percent*100).toFixed(1)}%)</title>
            </circle>
        `;
    });
    
    wrapper.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
            ${segmentsHtml}
        </svg>
    `;
}

// Hàm hỗ trợ định dạng tiền tệ trong chart
function formatCurrency(amount) {
    return `${new Intl.NumberFormat('vi-VN').format(amount)} VNĐ`;
}
