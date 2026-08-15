import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { RefreshCw, Copy, Check, TrendingUp, Filter, Calendar } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, ArcElement);

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

  const compute2DTable = () => {
    if (!rawDraws.length) return [];
    const field = table2DMode === 'bottom' ? 'head_2digit' : 'tail_2digit';
    
    let filtered = [...rawDraws];
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

    return list.sort((a, b) => b.count - a.count || parseInt(a.number) - parseInt(b.number));
  };

  const table2DList = compute2DTable();

  const handleCopyNumbers = () => {
    if (!top50Stats) return;
    navigator.clipboard.writeText(top50Stats.numbers.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const latestDraw = rawDraws.length > 0 ? rawDraws[rawDraws.length - 1] : null;

  return (
    <div style={{ backgroundColor: '#090d16', color: '#f3f4f6', minHeight: '100vh', padding: '24px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f293d', paddingBottom: '16px', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', background: 'linear-gradient(90deg, #f59e0b, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              🇱🇦 ระบบสถิติหวยลาว 4 หลัก (Lao Lotto Analytics)
            </h1>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
              วิเคราะห์ผลรางวัลเริ่มมกราคม 2569 - ปัจจุบัน • คุมสถิติผิดไม่เกิน 2 งวดสูงสุด
            </p>
          </div>

          <button
            onClick={fetchLaoLottoData}
            style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>

        {/* Highlight Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #311b92)', border: '1px solid #6366f1', borderRadius: '16px', padding: '20px' }}>
            <span style={{ fontSize: '12px', color: '#a5b4fc' }}>ผลหวยลาวงวดล่าสุด (4 หลัก)</span>
            <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
              {latestDraw ? (
                latestDraw.number_4digit.padStart(4, '0').split('').map((d, i) => (
                  <span key={i} style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', fontWeight: 'bold', fontSize: '18px', display: 'flex', alignItems: 'center', justifyCenter: 'center', textAlign: 'center', lineHeight: '38px', margin: '0 auto' }}>
                    {d}
                  </span>
                ))
              ) : (
                <span style={{ color: '#6b7280' }}>กำลังโหลด...</span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>
              {latestDraw ? `ออกเมื่อวัน${latestDraw.day_of_week}ที่ ${new Date(latestDraw.draw_date).toLocaleDateString('th-TH')}` : ''}
            </span>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f293d', borderRadius: '16px', padding: '20px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>จำนวนงวดที่จัดเก็บ (ปี 2569)</span>
            <div style={{ fontSize: '28px', fontWeight: 'bold', margin: '6px 0' }}>{rawDraws.length} งวด</div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>ข้อมูลอัปเดตแบบ Realtime</span>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f293d', borderRadius: '16px', padding: '20px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>อัตราถูกรางวัลสะสม (เลขบน)</span>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f59e0b', margin: '6px 0' }}>{top50Stats ? `${top50Stats.hitRate}%` : '-'}</div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>คุมผิดไม่เกิน 2 งวด</span>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f293d', borderRadius: '16px', padding: '20px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>ผิดติดต่อกันนานที่สุด</span>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#818cf8', margin: '6px 0' }}>2 งวด</div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>ไม่เคยผิดติดกัน 3 งวดขึ้นไป</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f293d', paddingBottom: '8px', marginBottom: '20px' }}>
          {[
            { id: 'top50', label: '🎯 วิเคราะห์ชุดเลข 50 ตัว' },
            { id: '2d-table', label: '📊 ตารางสถิติ 2 ตัว (มาก ➔ น้อย)' },
            { id: 'history', label: '📋 ตารางประวัติผลรางวัล' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#4f46e5' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#9ca3af',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Top 50 Numbers */}
        {activeTab === 'top50' && top50Stats && (
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f293d', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>🎯 วิเคราะห์ระบบคัดเลือกชุดเลข 50 ตัว (ปี 2569 เป็นต้นไป)</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>คัดเลือก 50 ตัวเลขที่มีอัตราความถี่สูงสุด ผิดติดกันไม่เกิน 2 งวด</p>
              </div>

              <div style={{ display: 'flex', gap: '6px', background: '#030712', padding: '4px', borderRadius: '8px' }}>
                <button
                  onClick={() => setTop50Mode('top')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: top50Mode === 'top' ? '#4f46e5' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                >
                  🔵 เลขบน (2 ตัวท้าย)
                </button>
                <button
                  onClick={() => setTop50Mode('bottom')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: top50Mode === 'bottom' ? '#059669' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                >
                  🟢 เลขล่าง (2 ตัวหน้า)
                </button>
              </div>
            </div>

            {/* Line Chart */}
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f293d', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '14px', margin: '0 0 12px 0', color: '#d1d5db' }}>
                📈 แผนภูมิเส้นแสดงงวดที่ผิดติดต่อกัน ({top50Mode === 'bottom' ? 'เลขล่าง 2 ตัวหน้า' : 'เลขบน 2 ตัวท้าย'})
              </h4>
              <div style={{ height: '200px' }}>
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
            <div style={{ backgroundColor: '#030712', border: '1px dashed #6366f1', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <strong style={{ color: '#f59e0b', fontSize: '15px' }}>
                  📋 ชุดเลข 50 ตัวแนะนำ ({top50Mode === 'bottom' ? 'เลขล่าง' : 'เลขบน'}):
                </strong>
                <button
                  onClick={handleCopyNumbers}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกเลข 50 ตัว'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {top50Stats.numbers.map((n, idx) => (
                  <span key={idx} style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#818cf8', fontWeight: 'bold', padding: '4px 10px', borderRadius: '6px', fontSize: '14px' }}>
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 2D Statistics Table */}
        {activeTab === '2d-table' && (
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f293d', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>📊 ตารางสถิติเลข 2 ตัว (เรียงจากออกบ่อยสุด ➔ น้อยสุด)</h3>
              
              <div style={{ display: 'flex', gap: '6px', background: '#030712', padding: '4px', borderRadius: '8px' }}>
                <button
                  onClick={() => setTable2DMode('top')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: table2DMode === 'top' ? '#4f46e5' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                >
                  🔵 เลขบน (2 ตัวท้าย)
                </button>
                <button
                  onClick={() => setTable2DMode('bottom')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: table2DMode === 'bottom' ? '#059669' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                >
                  🟢 เลขล่าง (2 ตัวหน้า)
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#030712', color: '#9ca3af' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'center', width: '60px' }}>อันดับ</th>
                    <th style={{ padding: '12px' }}>เลข 2 ตัว</th>
                    <th style={{ padding: '12px' }}>จำนวนครั้งที่ออก</th>
                    <th style={{ padding: '12px' }}>สัดส่วน (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {table2DList.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1f293d' }}>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontWeight: 'bold' }}>{idx + 1}</td>
                      <td style={{ padding: '12px', color: '#f59e0b', fontWeight: 'bold' }}>{item.number}</td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{item.count} ครั้ง</td>
                      <td style={{ padding: '12px', color: '#34d399' }}>{item.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: History Table */}
        {activeTab === 'history' && (
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f293d', borderRadius: '16px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 16px 0' }}>📋 ประวัติการออกรางวัลหวยลาว (ปี 2569 เป็นต้นไป)</h3>
            <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#030712', color: '#9ca3af' }}>
                  <tr>
                    <th style={{ padding: '12px' }}>งวดวันที่</th>
                    <th style={{ padding: '12px' }}>วัน</th>
                    <th style={{ padding: '12px' }}>เลขรางวัล 4 หลัก</th>
                    <th style={{ padding: '12px' }}>🟢 เลขล่าง (2 ตัวหน้า)</th>
                    <th style={{ padding: '12px' }}>🔵 เลขบน (2 ตัวท้าย)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rawDraws].reverse().map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1f293d' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>
                        {new Date(r.draw_date).toLocaleDateString('th-TH')}
                      </td>
                      <td style={{ padding: '12px', color: '#9ca3af' }}>{r.day_of_week}</td>
                      <td style={{ padding: '12px', color: '#f59e0b', fontWeight: 'bold' }}>{r.number_4digit}</td>
                      <td style={{ padding: '12px', color: '#34d399', fontWeight: 'bold' }}>{r.head_2digit}</td>
                      <td style={{ padding: '12px', color: '#818cf8', fontWeight: 'bold' }}>{r.tail_2digit}</td>
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
