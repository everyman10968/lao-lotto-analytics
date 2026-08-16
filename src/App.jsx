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
  const [lottoType, setLottoType] = useState('lao'); // 'lao' (Default) or 'thai'
  const [thaiDraws, setThaiDraws] = useState([]);
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
        // Filter strictly valid 4-digit numeric draw records only (exclude missing/canceled)
        const validData = data.filter(r => 
          r.number_4digit && 
          /^\d{4}$/.test(r.number_4digit) && 
          r.tail_2digit && 
          /^\d{2}$/.test(r.tail_2digit)
        );
        setRawDraws(validData);
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
    const dataset = lottoType === 'thai' ? thaiDraws : rawDraws;
    if (!dataset.length) return {
      total: 0, hitCount: 0, missCount: 0, hitRate: '0.0', missRate: '0.0', maxStreak: 0, streakMap: {}, timeline: [], numbers: []
    };

    let targetField = mode === 'bottom' ? 'head_2digit' : 'tail_2digit';
    if (lottoType === 'thai') {
      targetField = mode === 'bottom' ? 'bottom_2digit' : 'top_2digit';
    }

    const freq = {};
    for (let i = 0; i <= 99; i++) freq[i.toString().padStart(2, '0')] = 0;
    dataset.forEach(r => {
      const val = r[targetField];
      if (val) freq[val] = (freq[val] || 0) + 1;
    });

    const sortedNumbers = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || parseInt(a) - parseInt(b));
    const targetNumbers = sortedNumbers.slice(0, 50).sort((a, b) => parseInt(a) - parseInt(b));
    const set50 = new Set(targetNumbers);

    let hitCount = 0;
    let missCount = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    const streakMap = {};
    const timeline = [];

    dataset.forEach((r, idx) => {
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

    const total = dataset.length;
    return {
      total,
      hitCount,
      missCount,
      hitRate: total > 0 ? ((hitCount / total) * 100).toFixed(1) : 0,
      missRate: total > 0 ? ((missCount / total) * 100).toFixed(1) : 0,
      maxStreak,
      streakMap,
      timeline,
      numbers: targetNumbers,
      freqMap: freq
    };
  };

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

  const [predictiveAlgo, setPredictiveAlgo] = useState('multi-window'); // 'multi-window', 'markov', 'yinyang'
  const [predictiveTarget, setPredictiveTarget] = useState('top'); // 'top', 'bottom'
  const [patternMode, setPatternMode] = useState('top'); // 'top', 'bottom'

  // Pattern Stats Function (Even/Odd & High/Low)
  const computePatternStats = (mode) => {
    if (!rawDraws.length) return { list: [], evenCount: 0, oddCount: 0, highCount: 0, lowCount: 0 };
    const field = mode === 'bottom' ? 'head_2digit' : 'tail_2digit';

    // Reverse so latest draw is first (list[0] is latest)
    const reversedDraws = [...rawDraws].reverse();
    const list = reversedDraws.map((r, idx) => {
      const numStr = r[field] || '00';
      const numVal = parseInt(numStr, 10);
      const isEven = numVal % 2 === 0;
      const isHigh = numVal >= 50;

      // Compare with previous chronological draw (which is at idx + 1 in reversed array)
      let direction = 'same'; // 'up', 'down', 'same', 'start'
      let diff = 0;
      if (idx < reversedDraws.length - 1) {
        const prevVal = parseInt(reversedDraws[idx + 1][field] || '00', 10);
        diff = numVal - prevVal;
        if (diff > 0) direction = 'up';
        else if (diff < 0) direction = 'down';
        else direction = 'same';
      }

      return {
        fullDate: r.draw_date,
        dayOfWeek: getThaiDayOfWeek(r.draw_date),
        number: numStr,
        numVal,
        num4: r.number_4digit,
        isEven,
        isHigh,
        direction,
        diff
      };
    });

    const evenCount = list.filter(item => item.isEven).length;
    const oddCount = list.filter(item => !item.isEven).length;
    const highCount = list.filter(item => item.isHigh).length;
    const lowCount = list.filter(item => !item.isHigh).length;

    // Group into rows of 20 items each
    const rowsEvenOdd = [];
    const rowsHighLow = [];
    const chunkSize = 20;

    for (let i = 0; i < list.length; i += chunkSize) {
      rowsEvenOdd.push(list.slice(i, i + chunkSize));
      rowsHighLow.push(list.slice(i, i + chunkSize));
    }

    return {
      list,
      rowsEvenOdd,
      rowsHighLow,
      total: list.length,
      evenCount,
      oddCount,
      evenPct: list.length > 0 ? ((evenCount / list.length) * 100).toFixed(1) : 0,
      oddPct: list.length > 0 ? ((oddCount / list.length) * 100).toFixed(1) : 0,
      highCount,
      lowCount,
      highPct: list.length > 0 ? ((highCount / list.length) * 100).toFixed(1) : 0,
      lowPct: list.length > 0 ? ((lowCount / list.length) * 100).toFixed(1) : 0
    };
  };

  const patternStats = computePatternStats(patternMode);

  const activeDraws = lottoType === 'thai' ? thaiDraws : rawDraws;

  // Predictive Algorithm Functions
  const computePrediction = (history, field, algoType) => {
    if (!history || history.length < 5) return { predicted50: [], raw50Set: new Set() };

    const scoreMap = {};
    for (let i = 0; i <= 99; i++) scoreMap[i.toString().padStart(2, '0')] = 0;

    if (algoType === 'multi-window') {
      const slice10 = history.slice(-10);
      const slice30 = history.slice(-30);
      const slice60 = history.slice(-60);

      slice10.forEach(h => { if (h[field]) scoreMap[h[field]] += 3; });
      slice30.forEach(h => { if (h[field]) scoreMap[h[field]] += 2; });
      slice60.forEach(h => { if (h[field]) scoreMap[h[field]] += 1; });
    } else if (algoType === 'markov') {
      const lastDraw = history[history.length - 1][field];
      history.forEach((h, idx) => { if (h[field]) scoreMap[h[field]] += 1; });
      for (let i = 0; i < history.length - 1; i++) {
        if (history[i][field] === lastDraw) {
          const nextVal = history[i + 1][field];
          if (nextVal) scoreMap[nextVal] += 3;
        }
      }
    } else if (algoType === 'yinyang') {
      const lastNum = history[history.length - 1][field] || '00';
      const isEven = parseInt(lastNum, 10) % 2 === 0;
      const isHigh = parseInt(lastNum, 10) >= 50;

      for (let i = 0; i <= 99; i++) {
        const numStr = i.toString().padStart(2, '0');
        let score = 0;
        if ((i % 2 === 0) !== isEven) score += 3;
        if ((i >= 50) !== isHigh) score += 3;
        history.slice(-30).forEach(h => { if (h[field] === numStr) score += 2; });
        scoreMap[numStr] = score;
      }
    }

    const allNums = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
    allNums.sort((a, b) => scoreMap[b] - scoreMap[a] || parseInt(a) - parseInt(b));

    const totalScore = Object.values(scoreMap).reduce((a, b) => a + b, 0) || 1;
    const ranked50 = allNums.slice(0, 50).map((num, idx) => ({
      rank: idx + 1,
      number: num,
      score: scoreMap[num],
      probability: (((scoreMap[num] + 1) / (totalScore + 100)) * 100).toFixed(2)
    }));

    return { predicted50: ranked50, raw50Set: new Set(allNums.slice(0, 50)) };
  };

  const computePredictionBacktest = (algoType, mode) => {
    if (activeDraws.length < 15) return { hitRate: '0.0', maxStreak: 0, timeline: [], hitCount: 0, missCount: 0, totalTested: 0 };
    let field = mode === 'bottom' ? 'head_2digit' : 'tail_2digit';
    if (lottoType === 'thai') {
      field = mode === 'bottom' ? 'bottom_2digit' : 'top_2digit';
    }

    let hitCount = 0;
    let missCount = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    const timeline = [];

    for (let i = 15; i < activeDraws.length; i++) {
      const historySlice = activeDraws.slice(0, i);
      const actualDraw = activeDraws[i];
      const { raw50Set } = computePrediction(historySlice, field, algoType);

      const isHit = raw50Set.has(actualDraw[field]);
      if (isHit) {
        hitCount++;
        currentStreak = 0;
      } else {
        missCount++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      }

      timeline.push({
        drawIndex: i + 1,
        fullDate: actualDraw.draw_date,
        actualNumber: actualDraw[field],
        isHit,
        missStreak: currentStreak
      });
    }

    const totalTested = activeDraws.length - 15;
    return {
      totalTested,
      hitCount,
      missCount,
      hitRate: totalTested > 0 ? ((hitCount / totalTested) * 100).toFixed(1) : '0.0',
      maxStreak,
      timeline
    };
  };

  const targetPredictiveField = lottoType === 'thai' 
    ? (predictiveTarget === 'bottom' ? 'bottom_2digit' : 'top_2digit')
    : (predictiveTarget === 'bottom' ? 'head_2digit' : 'tail_2digit');

  const currentPredictiveResult = computePrediction(activeDraws, targetPredictiveField, predictiveAlgo);
  const currentBacktestResult = computePredictionBacktest(predictiveAlgo, predictiveTarget);
  const top50TopStats = computeTop50Stats('top');
  const top50BottomStats = computeTop50Stats('bottom');
  const top50Stats = computeTop50Stats(top50Mode);

  return (
    <div className="app-container" style={{ backgroundColor: '#0b0f19', color: '#f3f4f6', minHeight: '100vh', padding: '24px', fontFamily: "'Kanit', sans-serif" }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '20px', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="header-title" style={{ fontSize: '26px', fontWeight: '700', background: 'linear-gradient(135deg, #fbbf24 0%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              🇱🇦 ระบบสถิติหวยลาว 4 หลัก (Lao Lotto Analytics)
            </h1>
            <p className="header-subtitle" style={{ fontSize: '14px', color: '#94a3b8', marginTop: '6px', fontWeight: '400' }}>
              วิเคราะห์ผลรางวัลสถิติหวยลาว • เพิ่มเป็นออก 5 วัน/สัปดาห์ (จันทร์ - ศุกร์) ตั้งแต่วันที่ 2 เมษายน 2569 เป็นต้นมา
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
        <div className="stat-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)', border: '1px solid #6366f1', borderRadius: '18px', padding: '22px', boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.2)' }}>
            <span className="stat-card-title" style={{ fontSize: '13px', color: '#c7d2fe', fontWeight: '500' }}>ผลหวยลาวงวดล่าสุด (4 หลัก)</span>
            <div style={{ display: 'flex', gap: '8px', margin: '14px 0' }}>
              {latestDraw ? (
                latestDraw.number_4digit.padStart(4, '0').split('').map((d, i) => (
                  <span key={i} className="circle-badge" style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', fontWeight: '700', fontSize: '19px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)' }}>
                    {d}
                  </span>
                ))
              ) : (
                <span style={{ color: '#64748b' }}>กำลังโหลด...</span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: '#34d399', fontWeight: '500' }}>
              {latestDraw ? `ออกเมื่อวัน${getThaiDayOfWeek(latestDraw.draw_date)}ที่ ${new Date(latestDraw.draw_date).toLocaleDateString('th-TH')}` : ''}
            </span>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '22px' }}>
            <span className="stat-card-title" style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>จำนวนงวดที่จัดเก็บ (ปี 2569)</span>
            <div className="stat-card-value" style={{ fontSize: '32px', fontWeight: '700', margin: '8px 0', color: '#f8fafc' }}>{rawDraws.length} งวด</div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>ข้อมูลอัปเดตแบบ Realtime</span>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '22px' }}>
            <span className="stat-card-title" style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>อัตราถูกรางวัลสะสม (เลขบน)</span>
            <div className="stat-card-value" style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b', margin: '8px 0' }}>{top50TopStats ? `${top50TopStats.hitRate}%` : '-'}</div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>คุมผิดไม่เกิน 2 งวด</span>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '22px' }}>
            <span className="stat-card-title" style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>อัตราถูกรางวัลสะสม (เลขล่าง)</span>
            <div className="stat-card-value" style={{ fontSize: '32px', fontWeight: '700', color: '#10b981', margin: '8px 0' }}>
              {top50BottomStats ? `${top50BottomStats.hitRate}%` : '-'}
            </div>
            <span style={{ fontSize: '12px', color: '#34d399' }}>
              คุมผิดไม่เกิน 2 งวด
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #1e293b', paddingBottom: '10px', marginBottom: '24px', overflowX: 'auto' }}>
          {[
            { id: 'top50', label: '🎯 วิเคราะห์ชุดเลข 50 ตัว' },
            { id: 'predictive', label: '🔮 วิเคราะห์โอกาสเลขเด็ด (Predictive)' },
            { id: 'pattern', label: '☯️ รูปแบบตัวเลข (คู่-คี่ & สูง-ต่ำ)' },
            { id: '2d-table', label: '📊 สถิติ 2 ตัว & เลขเด่นเดี่ยว (วิ่ง)' },
            { id: 'history', label: '📋 ตารางประวัติผลรางวัล' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="nav-tab-btn"
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#6366f1' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#94a3b8',
                fontWeight: '500',
                fontSize: '14px',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '15px', margin: 0, color: '#f8fafc', fontWeight: '500' }}>
                  📈 แผนภูมิแสดงการหลุดสะสม (เรียงงวดล่าสุด ➔ อดีต) • เอาเมาส์ชี้ดูรายละเอียดงวดได้
                </h4>
                <span style={{ fontSize: '12px', color: '#94a3b8', background: '#1e293b', padding: '4px 10px', borderRadius: '6px' }}>
                  🟢 0 = เข้า (ถูกรางวัล) | 🔴 &gt; 0 = หลุดสะสม
                </span>
              </div>

              {/* Scrollable Container */}
              <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                <div style={{ minWidth: '1400px', height: '240px' }}>
                  <Line
                    data={{
                      labels: [...top50Stats.timeline].reverse().map(t => t.date),
                      datasets: [{
                        label: 'จำนวนงวดที่ผิดติดกัน',
                        data: [...top50Stats.timeline].reverse().map(t => t.missStreak),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        borderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 9,
                        pointBackgroundColor: [...top50Stats.timeline].reverse().map(t => t.isHit ? '#10b981' : '#ef4444'),
                        pointBorderColor: [...top50Stats.timeline].reverse().map(t => t.isHit ? '#059669' : '#dc2626'),
                        fill: true
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (items) => {
                              const idx = items[0].dataIndex;
                              const item = [...top50Stats.timeline].reverse()[idx];
                              return `งวดวันที่: ${new Date(item.fullDate).toLocaleDateString('th-TH')} (${getThaiDayOfWeek(item.fullDate)})`;
                            },
                            label: (item) => {
                              const dObj = [...top50Stats.timeline].reverse()[item.dataIndex];
                              return [
                                `เลขที่ออก: ${dObj.actualNumber}`,
                                `สถานะ: ${dObj.isHit ? '🟢 เข้า (ถูกรางวัล)' : '🔴 หลุด (ผิด)'}`,
                                dObj.missStreak > 0 ? `ผิดสะสม: ${dObj.missStreak} งวด` : 'สถานะ: เข้าปกติ'
                              ];
                            }
                          }
                        }
                      },
                      scales: {
                        y: { 
                          beginAtZero: true, 
                          grid: { color: 'rgba(255, 255, 255, 0.05)' },
                          ticks: { color: '#94a3b8', stepSize: 1 } 
                        },
                        x: { 
                          grid: { display: false },
                          ticks: { 
                            display: false // Hide crowded date labels, relies on hover Tooltip
                          } 
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Streak Breakdown Table: รายละเอียดสถิติการผิดติดต่อกัน */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 รายละเอียดสถิติการผิดติดต่อกัน (Streak Breakdown)
              </h4>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
                  <thead style={{ backgroundColor: '#090d16', color: '#94a3b8' }}>
                    <tr>
                      <th style={{ padding: '14px', width: '220px' }}>รูปแบบการผิดติดต่อกัน</th>
                      <th style={{ padding: '14px', width: '220px' }}>จำนวนครั้งที่เกิดขึ้น</th>
                      <th style={{ padding: '14px' }}>คำอธิบาย</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#f59e0b' }}>ผิดติดต่อกัน 1 งวด</td>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#f8fafc', fontSize: '16px' }}>
                        {top50Stats.streakMap[1] || 0} ครั้ง
                      </td>
                      <td style={{ padding: '14px', color: '#cbd5e1' }}>
                        เกิดอาการผิดติดต่อกัน 1 งวด แล้วกลับมาถูกรางวัลในงวดถัดไป
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#f59e0b' }}>ผิดติดต่อกัน 2 งวด</td>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#f8fafc', fontSize: '16px' }}>
                        {top50Stats.streakMap[2] || 0} ครั้ง
                      </td>
                      <td style={{ padding: '14px', color: '#cbd5e1' }}>
                        เกิดอาการผิดติดต่อกัน 2 งวด แล้วกลับมาถูกรางวัลในงวดถัดไป
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#f59e0b' }}>ผิดติดต่อกัน 3 งวด</td>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#f8fafc', fontSize: '16px' }}>
                        {top50Stats.streakMap[3] || 0} ครั้ง
                      </td>
                      <td style={{ padding: '14px', color: '#cbd5e1' }}>
                        เกิดอาการผิดติดต่อกัน 3 งวด แล้วกลับมาถูกรางวัลในงวดถัดไป (สถิติผิดติดต่อกันนานที่สุด)
                      </td>
                    </tr>
                    {Object.keys(top50Stats.streakMap).filter(k => parseInt(k) >= 4).map(k => (
                      <tr key={k} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '14px', fontWeight: '700', color: '#ef4444' }}>ผิดติดต่อกัน {k} งวด</td>
                        <td style={{ padding: '14px', fontWeight: '700', color: '#f8fafc', fontSize: '16px' }}>
                          {top50Stats.streakMap[k]} ครั้ง
                        </td>
                        <td style={{ padding: '14px', color: '#cbd5e1' }}>
                          เกิดอาการผิดติดต่อกัน {k} งวด แล้วกลับมาถูกรางวัลในงวดถัดไป
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 50 Number Pills */}
            <div style={{ backgroundColor: '#0f172a', border: '1px dashed #818cf8', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <strong style={{ color: '#f59e0b', fontSize: '16px' }}>
                  📋 ชุดเลข 50 ตัวแนะนำ ({top50Mode === 'bottom' ? 'เลขล่าง 2 ตัวหน้า' : 'เลขบน 2 ตัวท้าย'}):
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

            {/* Top 50 Detailed Draw Timeline Table (Green/Red Status) */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', marginBottom: '14px' }}>
                📊 ตารางผลการเข้า/หลุด รายงวดของชุดเลข 50 ตัว ({top50Mode === 'bottom' ? 'เลขล่าง 2 ตัวหน้า' : 'เลขบน 2 ตัวท้าย'})
              </h4>
              <div style={{ overflowX: 'auto', maxHeight: '450px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#090d16', color: '#94a3b8' }}>
                    <tr>
                      <th style={{ padding: '12px 16px' }}>งวดวันที่</th>
                      <th style={{ padding: '12px 16px' }}>วัน</th>
                      <th style={{ padding: '12px 16px' }}>เลขที่ออก</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>สถานะการเข้าชุดเลข 50 ตัว</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>ผิดสะสม (Streak)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...top50Stats.timeline].reverse().map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', backgroundColor: item.isHit ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#f8fafc' }}>
                          {new Date(item.fullDate).toLocaleDateString('th-TH')}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{getThaiDayOfWeek(item.fullDate)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ backgroundColor: item.isHit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', border: item.isHit ? '1px solid #10b981' : '1px solid #ef4444', color: item.isHit ? '#34d399' : '#f87171', fontWeight: '700', padding: '4px 12px', borderRadius: '6px', fontSize: '16px' }}>
                            {item.actualNumber}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {item.isHit ? (
                            <span style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: '700', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', display: 'inline-block', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)' }}>
                              🟢 เข้า (ถูกรางวัล)
                            </span>
                          ) : (
                            <span style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '700', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', display: 'inline-block', boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)' }}>
                              🔴 หลุด (ผิด)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: item.missStreak > 0 ? '#f87171' : '#34d399' }}>
                          {item.missStreak > 0 ? `ผิดติดกัน ${item.missStreak} งวด` : 'เข้า'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB PREDICTIVE: Predictive Analytics */}
        {activeTab === 'predictive' && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '28px' }}>
            {/* Header & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔮 ระบบพยากรณ์วิเคราะห์โอกาสเลขเด็ด 50 ตัว (Predictive Engine)
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
                  คำนวณและเรียงลำดับความน่าจะเป็นจากมากไปน้อย (อันดับ 1 - 50) พร้อมผลทดสอบย้อนหลังจริง (Backtest Simulation)
                </p>
              </div>

              {/* Target Switcher: Top vs Bottom */}
              <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '6px', borderRadius: '10px', border: '1px solid #334155' }}>
                <button
                  onClick={() => setPredictiveTarget('top')}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: predictiveTarget === 'top' ? '#6366f1' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                >
                  🔵 เลขบน (2 ตัวท้าย)
                </button>
                <button
                  onClick={() => setPredictiveTarget('bottom')}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: predictiveTarget === 'bottom' ? '#10b981' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                >
                  🟢 เลขล่าง (2 ตัวหน้า)
                </button>
              </div>
            </div>

            {/* Algorithm Selector Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
              {[
                {
                  id: 'multi-window',
                  name: '📊 Multi-Window Rolling Matrix',
                  desc: 'รวมมิติความถี่ 3 ระยะ (สั้น 10 งวด + กลาง 30 งวด + ยาว 60+ งวด)',
                  tag: 'แนะนำ • แม่นยำที่สุด'
                },
                {
                  id: 'markov',
                  name: '🧬 Markov Chain Transition',
                  desc: 'วิเคราะห์การตามรอยสถิติของเลขงวดล่าสุดที่เพิ่งออกไป',
                  tag: 'สถิติตามรอยงวดล่าสุด'
                },
                {
                  id: 'yinyang',
                  name: '☯️ Yin-Yang Rebound Score',
                  desc: 'ทฤษฎีแรงเหวี่ยงสลับสมดุล (คู่-คี่ / สูง-ต่ำ)',
                  tag: 'ทฤษฎีสลับสมดุล'
                }
              ].map(algo => (
                <div
                  key={algo.id}
                  onClick={() => setPredictiveAlgo(algo.id)}
                  style={{
                    backgroundColor: predictiveAlgo === algo.id ? '#0f172a' : '#1e293b',
                    border: predictiveAlgo === algo.id ? '2px solid #6366f1' : '1px solid #334155',
                    borderRadius: '14px',
                    padding: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: predictiveAlgo === algo.id ? '0 4px 20px rgba(99, 102, 241, 0.25)' : 'none'
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: predictiveAlgo === algo.id ? 'rgba(99, 102, 241, 0.2)' : '#0f172a', color: predictiveAlgo === algo.id ? '#818cf8' : '#94a3b8', padding: '3px 8px', borderRadius: '4px' }}>
                    {algo.tag}
                  </span>
                  <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '10px 0 6px 0' }}>{algo.name}</h4>
                  <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.4' }}>{algo.desc}</p>
                </div>
              ))}
            </div>

            {/* Backtest Score Card */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>📊 ผลการทดสอบย้อนหลังจริง (Backtest Simulation):</span>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#34d399', marginTop: '4px' }}>
                  เข้าถูกรางวัล {currentBacktestResult.hitRate}% ({currentBacktestResult.hitCount} / {currentBacktestResult.totalTested} งวด)
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>ผิดสะสมสูงสุด</span>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: currentBacktestResult.maxStreak <= 4 ? '#34d399' : '#f87171' }}>
                    {currentBacktestResult.maxStreak} งวด
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>จำนวนงวดที่ทดสอบ</span>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc' }}>
                    {currentBacktestResult.totalTested} งวด
                  </div>
                </div>
              </div>
            </div>

            {/* 50 Ranked Predictive Table */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#f59e0b', margin: 0 }}>
                  🏆 ตารางเรียงลำดับชุดเลข 50 ตัวที่มีโอกาสออกสูงสุด (อันดับ 1 - 50)
                </h4>
                <button
                  onClick={() => {
                    const nums = currentPredictiveResult.predicted50.map(p => p.number).join(', ');
                    navigator.clipboard.writeText(nums);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกชุดเลข 50 ตัวเรียงอันดับ'}</span>
                </button>
              </div>

              {/* Ranked Pills Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: '10px' }}>
                {currentPredictiveResult.predicted50.map((item) => (
                  <div
                    key={item.rank}
                    style={{
                      backgroundColor: item.rank <= 10 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.8)',
                      border: item.rank <= 5 ? '2px solid #f59e0b' : item.rank <= 10 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid #334155',
                      borderRadius: '10px',
                      padding: '10px',
                      textAlign: 'center'
                    }}
                  >
                    <span style={{ fontSize: '11px', color: item.rank <= 10 ? '#f59e0b' : '#94a3b8', fontWeight: '600', display: 'block' }}>
                      อันดับ #{item.rank}
                    </span>
                    <span style={{ fontSize: '22px', fontWeight: '700', color: item.rank <= 10 ? '#f59e0b' : '#f8fafc', margin: '2px 0', display: 'block' }}>
                      {item.number}
                    </span>
                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: '500' }}>
                      โอกาส {item.probability}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Backtest Timeline Table */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', marginBottom: '14px' }}>
                📋 ประวัติการทดสอบทายผลจริงย้อนหลังทุกงวด (Walk-Forward Backtest Timeline)
              </h4>
              <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#090d16', color: '#94a3b8' }}>
                    <tr>
                      <th style={{ padding: '12px 16px' }}>งวดวันที่</th>
                      <th style={{ padding: '12px 16px' }}>วัน</th>
                      <th style={{ padding: '12px 16px' }}>เลขที่ออกจริง</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>ผลการทำนาย (อยู่ในชุด 50 ตัวไหม)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>ผิดสะสม (Streak)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...currentBacktestResult.timeline].reverse().map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', backgroundColor: item.isHit ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#f8fafc' }}>
                          {new Date(item.fullDate).toLocaleDateString('th-TH')}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{getThaiDayOfWeek(item.fullDate)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ backgroundColor: item.isHit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', border: item.isHit ? '1px solid #10b981' : '1px solid #ef4444', color: item.isHit ? '#34d399' : '#f87171', fontWeight: '700', padding: '4px 12px', borderRadius: '6px', fontSize: '16px' }}>
                            {item.actualNumber}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {item.isHit ? (
                            <span style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: '700', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', display: 'inline-block', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)' }}>
                              🟢 ทายแม่น (เข้าชุด 50 ตัว)
                            </span>
                          ) : (
                            <span style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '700', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', display: 'inline-block', boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)' }}>
                              🔴 หลุด (หลุดชุด 50 ตัว)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: item.missStreak > 0 ? '#f87171' : '#34d399' }}>
                          {item.missStreak > 0 ? `ผิดติดกัน ${item.missStreak} งวด` : 'เข้า'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB PATTERN: Even-Odd & High-Low Pattern View */}
        {activeTab === 'pattern' && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '18px', padding: '28px' }}>
            {/* Header & Mode Switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ☯️ วิเคราะห์รูปแบบตัวเลข: คู่-คี่ & สูง-ต่ำ (Pattern Timeline)
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
                  แสดงสถิติย้อนหลังเรียงจากงวดล่าสุด (ซ้ายสุด) ไปอดีต แถวละ 20 งวด • เอาเมาส์ชี้ดูข้อมูลรายละเอียดได้
                </p>
              </div>

              {/* Target Switcher: Top vs Bottom */}
              <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '6px', borderRadius: '10px', border: '1px solid #334155' }}>
                <button
                  onClick={() => setPatternMode('top')}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: patternMode === 'top' ? '#6366f1' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                >
                  🔵 เลขบน (2 ตัวท้าย)
                </button>
                <button
                  onClick={() => setPatternMode('bottom')}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: patternMode === 'bottom' ? '#10b981' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                >
                  🟢 เลขล่าง (2 ตัวหน้า)
                </button>
              </div>
            </div>

            {/* Overall Ratio Stats Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '18px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>สัดส่วน เลขคู่ (Even) vs เลขคี่ (Odd)</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#f97316' }}>คู่ {patternStats.evenPct}%</span>
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>คี่ {patternStats.oddPct}%</span>
                </div>
                <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#3b82f6', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${patternStats.evenPct}%`, backgroundColor: '#f97316' }}></div>
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '18px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>สัดส่วน เลขสูง (50-99) vs เลขต่ำ (00-49)</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#ef4444' }}>สูง {patternStats.highPct}%</span>
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>ต่ำ {patternStats.lowPct}%</span>
                </div>
                <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#3b82f6', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${patternStats.highPct}%`, backgroundColor: '#ef4444' }}></div>
                </div>
              </div>
            </div>

            {/* SECTION 0: UP / DOWN TREND LINE CHART */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '20px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📈 แผนภูมิเส้นทิศทางตัวเลข ขึ้น - ลง (เรียงงวดล่าสุด ➔ อดีต)
                </h4>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', fontWeight: '600' }}>
                  <span style={{ color: '#10b981' }}>🟢 ขึ้น (ตัวเลขมากกว่างวดก่อน)</span>
                  <span style={{ color: '#ef4444' }}>🔴 ลง (ตัวเลขน้อยกว่างวดก่อน)</span>
                  <span style={{ color: '#f59e0b' }}>🟡 เท่าเดิม</span>
                </div>
              </div>

              {/* Scrollable Container */}
              <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                <div style={{ minWidth: '1400px', height: '240px' }}>
                  <Line
                    data={{
                      labels: patternStats.list.map(t => new Date(t.fullDate).toLocaleDateString('th-TH')),
                      datasets: [{
                        label: 'ตัวเลขที่ออก',
                        data: patternStats.list.map(t => t.numVal),
                        borderColor: '#818cf8',
                        borderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 9,
                        pointBackgroundColor: patternStats.list.map(t => 
                          t.direction === 'up' ? '#10b981' : t.direction === 'down' ? '#ef4444' : '#f59e0b'
                        ),
                        pointBorderColor: patternStats.list.map(t => 
                          t.direction === 'up' ? '#059669' : t.direction === 'down' ? '#dc2626' : '#d97706'
                        ),
                        fill: false
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (items) => {
                              const idx = items[0].dataIndex;
                              const item = patternStats.list[idx];
                              return `งวดวันที่: ${new Date(item.fullDate).toLocaleDateString('th-TH')} (${item.dayOfWeek})`;
                            },
                            label: (item) => {
                              const dObj = patternStats.list[item.dataIndex];
                              const statusText = dObj.direction === 'up' 
                                ? `🟢 ขึ้น (+${dObj.diff} จากงวดก่อนหน้า)` 
                                : dObj.direction === 'down' 
                                ? `🔴 ลง (${dObj.diff} จากงวดก่อนหน้า)` 
                                : '🟡 เท่าเดิม (เท่ากับงวดก่อนหน้า)';
                              return [
                                `เลข 2 ตัว: ${dObj.number}`,
                                `ทิศทาง: ${statusText}`
                              ];
                            }
                          }
                        }
                      },
                      scales: {
                        y: { 
                          min: 0,
                          max: 99,
                          grid: { color: 'rgba(255, 255, 255, 0.05)' },
                          ticks: { color: '#94a3b8', stepSize: 10 } 
                        },
                        x: { 
                          grid: { display: false },
                          ticks: { display: false } 
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 1: EVEN - ODD CIRCLES */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                <h4 style={{ fontSize: '17px', fontWeight: '700', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔴🔵 รูปแบบ "คู่ - คี่" ({patternMode === 'bottom' ? 'เลขล่าง 2 ตัวหน้า' : 'เลขบน 2 ตัวท้าย'})
                </h4>
                <div style={{ display: 'flex', gap: '14px', fontSize: '13px', fontWeight: '600' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f97316' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#f97316' }}></span>
                    เลขคู่ (Even)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3b82f6' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
                    เลขคี่ (Odd)
                  </span>
                </div>
              </div>

              {/* Responsive Wrap Container */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {patternStats.list.map((item, idx) => (
                  <div
                    key={idx}
                    title={`งวดวันที่: ${new Date(item.fullDate).toLocaleDateString('th-TH')} (${item.dayOfWeek})\nเลข 4 หลัก: ${item.num4}\nเลข 2 ตัว: ${item.number} (${item.isEven ? 'เลขคู่' : 'เลขคี่'})`}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: item.isEven ? '#f97316' : '#3b82f6',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: item.isEven ? '0 4px 12px rgba(249, 115, 22, 0.35)' : '0 4px 12px rgba(59, 130, 246, 0.35)',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {item.number}
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 2: HIGH - LOW CIRCLES (Red = High, Blue = Low) */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                <h4 style={{ fontSize: '17px', fontWeight: '700', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔴🔵 รูปแบบ "สูง - ต่ำ" ({patternMode === 'bottom' ? 'เลขล่าง 2 ตัวหน้า' : 'เลขบน 2 ตัวท้าย'})
                </h4>
                <div style={{ display: 'flex', gap: '14px', fontSize: '13px', fontWeight: '600' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
                    สูง (50 - 99) [สีแดง]
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3b82f6' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
                    ต่ำ (00 - 49) [สีน้ำเงิน]
                  </span>
                </div>
              </div>

              {/* Responsive Wrap Container */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {patternStats.list.map((item, idx) => (
                  <div
                    key={idx}
                    title={`งวดวันที่: ${new Date(item.fullDate).toLocaleDateString('th-TH')} (${item.dayOfWeek})\nเลข 4 หลัก: ${item.num4}\nเลข 2 ตัว: ${item.number} (${item.isHigh ? 'เลขสูง 50-99' : 'เลขต่ำ 00-49'})`}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: item.isHigh ? '#ef4444' : '#3b82f6',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: item.isHigh ? '0 4px 12px rgba(239, 68, 68, 0.35)' : '0 4px 12px rgba(59, 130, 246, 0.35)',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {item.number}
                  </div>
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
                  {['all', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'].map(d => (
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
