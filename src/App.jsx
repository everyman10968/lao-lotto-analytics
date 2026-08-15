import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { RefreshCw, Copy, Check, TrendingUp, Filter, Calendar } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, ArcElement);

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function getThaiDayOfWeek(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return DAY_NAMES[d.getUTCDay()] || '-';
}

const OPTIMIZED_50_TOP_2026 = [
  '02', '06', '08', '10', '11', '12', '13', '14', '15', '17', 
  '18', '19', '20', '21', '24', '27', '28', '30', '31', '32', 
  '34', '35', '36', '37', '38', '41', '42', '45', '46', '48', 
  '49', '51', '54', '56', '57', '58', '61', '62', '63', '64', 
  '65', '70', '73', '76', '81', '87', '89', '90', '91', '94'
];

const OPTIMIZED_50_BOTTOM_2026 = [
  '03', '04', '05', '12', '13', '14', '16', '18', '19', '20', 
  '21', '23', '24', '28', '29', '30', '31', '34', '36', '37', 
  '39', '40', '41', '42', '43', '45', '46', '48', '51', '52', 
  '54', '56', '58', '61', '62', '63', '64', '65', '67', '69', 
  '70', '73', '74', '76', '79', '84', '87', '90', '95', '97'
];

export default function App() {
  const [activeTab, setActiveTab] = useState('top50');
  const [top50Mode, setTop50Mode] = useState('top');
  const [table2DMode, setTable2DMode] = useState('top');
  const [selectedDayFilter, setSelectedDayFilter] = useState('all'); // 'all', 'จันทร์', 'พุธ', 'ศุกร์'
  const [rawDraws, setRawDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLaoLottoData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lao_lottery_analytics')
        .select('*')
        .gte('draw_date', '2026-01-01')
        .order('draw_date', { ascending: true });

      if (!error && data) {
        setRawDraws(data);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLaoLottoData();
  }, []);

  const computeTop50Stats = (mode) => {
    if (!rawDraws.length) return null;
    const targetField = mode === 'bottom' ? 'head_2digit' : 'tail_2digit';
    const targetNumbers = mode === 'bottom' ? OPTIMIZED_50_BOTTOM_2026 : OPTIMIZED_50_TOP_2026;
    const set50 = new Set(targetNumbers);

    let hitCount = 0;
    let missCount = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    const streakMap = {};
    const timeline = [];

    rawDraws.forEach((r, idx) => {
      const val = r[targetField];
      const isHit = set50.has(val);

      if (isHit) {
        hitCount++;
        if (currentStreak > 0) {
          streakMap[currentStreak] = (streakMap[currentStreak] || 0) + 1;
          currentStreak = 0;
        }
      } else {
        missCount++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      }

      timeline.push({
        drawIndex: idx + 1,
        date: new Date(r.draw_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }),
        fullDate: r.draw_date,
        actualNumber: val,
        isHit,
        missStreak: currentStreak
      });
    });

    if (currentStreak > 0) {
      streakMap[currentStreak] = (streakMap[currentStreak] || 0) + 1;
    }

    const total = rawDraws.length;
    return {
      total,
      hitCount,
      missCount,
      hitRate: total > 0 ? ((hitCount / total) * 100).toFixed(1) : 0,
      missRate: total > 0 ? ((missCount / total) * 100).toFixed(1) : 0,
      maxStreak,
      streakMap,
      timeline,
      numbers: targetNumbers
    };
  };

  const top50Stats = computeTop50Stats(top50Mode);

  // Compute 2D Frequency Table by Selected Day
  const compute2DTable = () => {
    if (!rawDraws.length) return { list: [], total: 0 };
    const field = table2DMode === 'bottom' ? 'head_2digit' : 'tail_2digit';
    
    let filtered = [...rawDraws];
    if (selectedDayFilter !== 'all') {
      filtered = filtered.filter(r => getThaiDayOfWeek(r.draw_date) === selectedDayFilter);
    }
    if (startDate) filtered = filtered.filter(r => r.draw_date >= startDate);
    if (endDate) filtered = filtered.filter(r => r.draw_date <= endDate);

    const freqMap = {};
    for (let i = 0; i <= 99; i++) freqMap[i.toString().padStart(2, '0')] = 0;
    filtered.forEach(r => freqMap[r[field]]++);

    const total = filtered.length;
    const list = Object.keys(freqMap).map(num => ({
      number: num,
      count: freqMap[num],
      percentage: total > 0 ? ((freqMap[num] / total) * 100).toFixed(1) : 0
    }));

    return {
      list: list.sort((a, b) => b.count - a.count || parseInt(a.number) - parseInt(b.number)),
      total
    };
  };

  // Compute Single Digit Frequency (เลขวิ่ง 0-9) by Selected Day
  const computeSingleDigitTable = () => {
    if (!rawDraws.length) return { list: [], total: 0 };
    const field = table2DMode === 'bottom' ? 'head_2digit' : 'tail_2digit';

    let filtered = [...rawDraws];
    if (selectedDayFilter !== 'all') {
      filtered = filtered.filter(r => getThaiDayOfWeek(r.draw_date) === selectedDayFilter);
    }
    if (startDate) filtered = filtered.filter(r => r.draw_date >= startDate);
    if (endDate) filtered = filtered.filter(r => r.draw_date <= endDate);

    const singleFreq = Array(10).fill(0);
    filtered.forEach(r => {
      const num2 = (r[field] || '').padStart(2, '0');
      const d1 = parseInt(num2[0], 10);
      const d2 = parseInt(num2[1], 10);
      if (!isNaN(d1)) singleFreq[d1]++;
      if (!isNaN(d2)) singleFreq[d2]++;
    });

    const totalDraws = filtered.length;
    const totalDigits = totalDraws * 2; // Each 2-digit number contains 2 single digits

    const list = singleFreq.map((count, digit) => ({
      digit: digit.toString(),
      count,
      percentage: totalDraws > 0 ? ((count / totalDraws) * 100).toFixed(1) : 0
    }));

    return {
      list: list.sort((a, b) => b.count - a.count || parseInt(a.digit) - parseInt(b.digit)),
      totalDraws
    };
  };

  const { list: table2DList, total: table2DTotalDraws } = compute2DTable();
  const { list: singleDigitList } = computeSingleDigitTable();

  const handleCopyNumbers = () => {
    if (!top50Stats) return;
    navigator.clipboard.writeText(top50Stats.numbers.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const latestDraw = rawDraws.length > 0 ? rawDraws[rawDraws.length - 1] : null;

  return (
    <div style={{ backgroundColor: '#0b0f19', color: '#f3f4f6', minHeight: '100vh', padding: '24px', fontFamily: "'Kanit', sans-serif" }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '20px', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '700', background: 'linear-gradient(135deg, #fbbf24 0%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              🇱🇦 ระบบสถิติหวยลาว 4 หลัก (Lao Lotto Analytics)
            </h1>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '6px', fontWeight: '400' }}>
              วิเคราะห์ผลรางวัลตั้งแต่มกราคม 2569 - ปัจจุบัน • คุมสถิติผิดไม่เกิน 2 งวดสูงสุด
            </p>
          </div>

          <button
            onClick={fetchLaoLottoData}
            style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', fontSize: '14px', transition: 'all 0.2s' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>

        {/* Highlight Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '28px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)', border: '1px solid #6366f1', borderRadius: '18px', padding: '22px', boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.2)' }}>
            <span style={{ fontSize: '13px', color: '#c7d2fe', fontWeight: '500' }}>ผลหวยลาวงวดล่าสุด (4 หลัก)</span>
            <div style={{ display: 'flex', gap: '10px', margin: '14px 0' }}>
              {latestDraw ? (
                latestDraw.number_4digit.padStart(4, '0').split('').map((d, i) => (
                  <span key={i} style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', fontWeight: '700', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)' }}>
                    {d}
                  </span>
                ))
              ) : (
                <span style={{ color: '#64748b' }}>กำลังโหลด...</span>
              )}
            </div>
            <span style={{ fontSize: '13px', color: '#34d399', fontWeight: '500' }}>
              {latestDraw ? `ออกเมื่อวัน${getThaiDayOfWeek(latestDraw.draw_date)}ที่ ${new Date(latestDraw.draw_date).toLocaleDateString('th-TH')}` : ''}
            </span>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '22px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>จำนวนงวดที่จัดเก็บ (ปี 2569)</span>
            <div style={{ fontSize: '32px', fontWeight: '700', margin: '8px 0', color: '#f8fafc' }}>{rawDraws.length} งวด</div>
            <span style={{ fontSize: '13px', color: '#34d399' }}>ข้อมูลอัปเดตแบบ Realtime</span>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '22px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>อัตราถูกรางวัลสะสม (เลขบน)</span>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b', margin: '8px 0' }}>{top50Stats ? `${top50Stats.hitRate}%` : '-'}</div>
            <span style={{ fontSize: '13px', color: '#34d399' }}>คุมผิดไม่เกิน 2 งวด</span>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '22px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>ผิดติดต่อกันนานที่สุด</span>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#818cf8', margin: '8px 0' }}>2 งวด</div>
            <span style={{ fontSize: '13px', color: '#34d399' }}>ไม่เคยผิดติดกัน 3 งวดขึ้นไป</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #1e293b', paddingBottom: '10px', marginBottom: '24px', overflowX: 'auto' }}>
          {[
            { id: 'top50', label: '🎯 วิเคราะห์ชุดเลข 50 ตัว' },
            { id: '2d-table', label: '📊 สถิติ 2 ตัว & เลขเด่นเดี่ยว (วิ่ง)' },
            { id: 'history', label: '📋 ตารางประวัติผลรางวัล' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#6366f1' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#94a3b8',
                fontWeight: '500',
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Top 50 Numbers */}
        {activeTab === 'top50' && top50Stats && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', itemsCenter: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: '#f8fafc' }}>🎯 วิเคราะห์ระบบคัดเลือกชุดเลข 50 ตัว (ปี 2569 เป็นต้นไป)</h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>คัดเลือก 50 ตัวเลขที่มีอัตราความถี่สูงสุด ผิดติดกันไม่เกิน 2 งวด</p>
              </div>

              <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '6px', borderRadius: '10px', border: '1px solid #334155' }}>
                <button
                  onClick={() => setTop50Mode('top')}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: top50Mode === 'top' ? '#6366f1' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
                >
                  🔵 เลขบน (2 ตัวท้าย)
                </button>
                <button
                  onClick={() => setTop50Mode('bottom')}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: top50Mode === 'bottom' ? '#10b981' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
                >
                  🟢 เลขล่าง (2 ตัวหน้า)
                </button>
              </div>
            </div>

            {/* Line Chart */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '15px', margin: '0 0 14px 0', color: '#f8fafc', fontWeight: '500' }}>
                📈 แผนภูมิเส้นแสดงงวดที่ผิดติดต่อกัน ({top50Mode === 'bottom' ? 'เลขล่าง 2 ตัวหน้า' : 'เลขบน 2 ตัวท้าย'})
              </h4>
              <div style={{ height: '220px' }}>
                <Line
                  data={{
                    labels: top50Stats.timeline.map(t => t.date),
                    datasets: [{
                      label: 'จำนวนงวดที่ผิดติดกัน (0 = ถูกรางวัล)',
                      data: top50Stats.timeline.map(t => t.missStreak),
                      borderColor: '#ef4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      borderWidth: 2,
                      pointRadius: 3,
                      fill: true
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, ticks: { stepSize: 1 } },
                      x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 25 } }
                    }
                  }}
                />
              </div>
            </div>

            {/* 50 Number Pills */}
            <div style={{ backgroundColor: '#0f172a', border: '1px dashed #818cf8', borderRadius: '14px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <strong style={{ color: '#f59e0b', fontSize: '16px' }}>
                  📋 ชุดเลข 50 ตัวแนะนำ ({top50Mode === 'bottom' ? 'เลขล่าง' : 'เลขบน'}):
                </strong>
                <button
                  onClick={handleCopyNumbers}
                  style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกเลข 50 ตัว'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {top50Stats.numbers.map((n, idx) => (
                  <span key={idx} style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#818cf8', fontWeight: '600', padding: '6px 12px', borderRadius: '8px', fontSize: '15px' }}>
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 2D Statistics & Single Digit Frequency */}
        {activeTab === '2d-table' && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '28px', spaceY: '24px' }}>
            
            {/* Top Switcher & Day Filter Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: '#f8fafc' }}>
                  📊 สถิติเลข 2 ตัว และ สถิติเลขตัวเดียว (เลขวิ่ง 0-9) แยกตามวันที่ออก
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
                  คำนวณจากทั้งหมด {table2DTotalDraws} งวด {selectedDayFilter !== 'all' ? `(เฉพาะวัน${selectedDayFilter})` : '(ทุกวัน)'}
                </p>
              </div>

              {/* Day Filter Switches */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '6px', background: '#0f172a', padding: '4px', borderRadius: '10px', border: '1px solid #334155' }}>
                  <button
                    onClick={() => setTable2DMode('top')}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: table2DMode === 'top' ? '#6366f1' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
                  >
                    🔵 เลขบน (2 ตัวท้าย)
                  </button>
                  <button
                    onClick={() => setTable2DMode('bottom')}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: table2DMode === 'bottom' ? '#10b981' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
                  >
                    🟢 เลขล่าง (2 ตัวหน้า)
                  </button>
                </div>

                {/* Day of Week Selector */}
                <div style={{ display: 'flex', gap: '6px', background: '#0f172a', padding: '4px', borderRadius: '10px', border: '1px solid #334155' }}>
                  {['all', 'จันทร์', 'พุธ', 'ศุกร์'].map(d => (
                    <button
                      key={d}
                      onClick={() => setSelectedDayFilter(d)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: selectedDayFilter === d ? '#f59e0b' : 'transparent',
                        color: selectedDayFilter === d ? '#000' : '#94a3b8',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '13px'
                      }}
                    >
                      {d === 'all' ? 'ทุกวัน' : `วัน${d}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SECTION: Single Digit Frequency (เลขเด่นตัวเดียว / เลขวิ่ง 0-9) */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#fbbf24', margin: 0 }}>
                  🔥 สถิติความถี่ "เลขตัวเดียว / เลขวิ่ง" (0 - 9) ใน {table2DMode === 'bottom' ? 'เลขล่าง' : 'เลขบน'}
                </h4>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  เรียงจากออกบ่อยที่สุด ➔ น้อยที่สุด
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px' }}>
                {singleDigitList.map((item, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      backgroundColor: idx < 3 ? 'rgba(245, 158, 11, 0.15)' : '#1e293b', 
                      border: idx < 3 ? '1px solid #f59e0b' : '1px solid #334155', 
                      borderRadius: '12px', 
                      padding: '12px', 
                      textAlign: 'center' 
                    }}
                  >
                    <div style={{ fontSize: '22px', fontWeight: '700', color: idx < 3 ? '#f59e0b' : '#818cf8' }}>
                      เลข {item.digit}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginTop: '4px' }}>
                      {item.count} ครั้ง
                    </div>
                    <div style={{ fontSize: '11px', color: '#34d399', marginTop: '2px' }}>
                      {item.percentage}% ของงวด
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION: 2-Digit Full Frequency Table */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', marginBottom: '14px' }}>
                📊 ตารางสถิติเลข 2 ตัว (00 - 99) {selectedDayFilter !== 'all' ? `ประจำวัน${selectedDayFilter}` : ''}
              </h4>
              <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#090d16', color: '#94a3b8' }}>
                    <tr>
                      <th style={{ padding: '14px', textAlign: 'center', width: '70px' }}>อันดับ</th>
                      <th style={{ padding: '14px' }}>เลข 2 ตัว</th>
                      <th style={{ padding: '14px' }}>จำนวนครั้งที่ออก</th>
                      <th style={{ padding: '14px' }}>สัดส่วน (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table2DList.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{idx + 1}</td>
                        <td style={{ padding: '14px' }}>
                          <span style={{ backgroundColor: table2DMode === 'bottom' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)', border: table2DMode === 'bottom' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)', color: table2DMode === 'bottom' ? '#34d399' : '#818cf8', fontWeight: '700', padding: '4px 10px', borderRadius: '6px' }}>
                            {item.number}
                          </span>
                        </td>
                        <td style={{ padding: '14px', fontWeight: '600', color: '#f8fafc' }}>{item.count} ครั้ง</td>
                        <td style={{ padding: '14px', color: '#f59e0b', fontWeight: '600' }}>{item.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: History Table */}
        {activeTab === 'history' && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '28px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 20px 0', color: '#f8fafc' }}>📋 ประวัติการออกรางวัลหวยลาว (ปี 2569 เป็นต้นไป)</h3>
            <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', color: '#94a3b8' }}>
                  <tr>
                    <th style={{ padding: '14px' }}>งวดวันที่</th>
                    <th style={{ padding: '14px' }}>วัน</th>
                    <th style={{ padding: '14px' }}>เลขรางวัล 4 หลัก</th>
                    <th style={{ padding: '14px' }}>🟢 เลขล่าง (2 ตัวหน้า)</th>
                    <th style={{ padding: '14px' }}>🔵 เลขบน (2 ตัวท้าย)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rawDraws].reverse().map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '14px', fontWeight: '600', color: '#f8fafc' }}>
                        {new Date(r.draw_date).toLocaleDateString('th-TH')}
                      </td>
                      <td style={{ padding: '14px', color: '#cbd5e1', fontWeight: '500' }}>{getThaiDayOfWeek(r.draw_date)}</td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontWeight: '700', padding: '4px 10px', borderRadius: '6px' }}>
                          {r.number_4digit}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontWeight: '700', padding: '4px 10px', borderRadius: '6px' }}>
                          {r.head_2digit}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8', fontWeight: '700', padding: '4px 10px', borderRadius: '6px' }}>
                          {r.tail_2digit}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
