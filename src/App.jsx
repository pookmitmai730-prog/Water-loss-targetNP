import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc } from 'firebase/firestore';

// --- Array สีสำหรับแจกจ่ายให้แต่ละ MM แตกต่างกัน ---
const MM_COLORS = [
  { bg: '#ebf8ff', border: '#3182ce', badge: '#2b6cb0' }, // ฟ้า
  { bg: '#f0fdf4', border: '#16a34a', badge: '#15803d' }, // เขียว
  { bg: '#fef3c7', border: '#d97706', badge: '#b45309' }, // เหลือง/ส้ม
  { bg: '#fdf2f8', border: '#db2777', badge: '#be185d' }, // ชมพู
  { bg: '#f5f3ff', border: '#7c3aed', badge: '#6d28d9' }, // ม่วง
  { bg: '#ecfeff', border: '#0891b2', badge: '#0e7490' }, // ฟ้าคราม
];

// --- Component ย่อยแสดงแผนผัง Tree ---
function TreeNode({ node, allNodes, records, onDeleteNode, mmColorMap }) {
  const children = allNodes.filter(n => n.parentId === node.id);
  const rec = records[node.id] || { qin: 0, qmeter: 0 };
  const qin = Number(rec.qin) || 0;
  const qmeter = Number(rec.qmeter) || 0;
  const lossVol = qin >= qmeter ? qin - qmeter : 0;
  const lossPct = qin > 0 ? (lossVol / qin) * 100 : 0;

  const getRootMmId = (currNode, nodesList) => {
    if (!currNode.parentId) return currNode.type === 'MM' ? currNode.id : null;
    const parent = nodesList.find(n => n.id === currNode.parentId);
    if (!parent) return null;
    return getRootMmId(parent, nodesList);
  };

  const rootMmId = getRootMmId(node, allNodes);
  const theme = node.type === 'MM' 
    ? (mmColorMap[node.id] || MM_COLORS[0]) 
    : (rootMmId && mmColorMap[rootMmId] ? mmColorMap[rootMmId] : { bg: '#f7fafc', border: '#cbd5e0', badge: '#4a5568' });

  return (
    <li style={{ margin: '8px 0', listStyleType: 'none' }}>
      <div 
        onDoubleClick={() => onDeleteNode(node)}
        title="💡 ดับเบิลคลิกเพื่อลบโซนนี้"
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '10px',
          background: theme.bg,
          border: `1.5px solid ${theme.border}`,
          padding: '6px 12px',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span style={{ 
          background: theme.badge, 
          color: 'white', 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontSize: '11px',
          fontWeight: 'bold'
        }}>
          {node.type}
        </span>
        <strong style={{ color: '#2d3748' }}>{node.name}</strong>
        <span style={{ fontSize: '13px', color: '#718096' }}>
          (มาตร DMA: {qin.toLocaleString()} คิว | สูญเสีย: <strong style={{ color: '#c53030' }}>{lossPct.toFixed(1)}%</strong> / {lossVol.toLocaleString()} คิว)
        </span>
        <span style={{ fontSize: '11px', color: '#e53e3e', marginLeft: '5px' }}>[ดับเบิลคลิกเพื่อลบ ❌]</span>
      </div>

      {children.length > 0 && (
        <ul style={{ paddingLeft: '25px', borderLeft: `2px dashed ${theme.border}`, margin: '5px 0 0 10px' }}>
          {children.map(child => (
            <TreeNode key={child.id} node={child} allNodes={allNodes} records={records} onDeleteNode={onDeleteNode} mmColorMap={mmColorMap} />
          ))}
        </ul>
      )}
    </li>
  );
}

function WaterLossDashboard() {
  const [activeTab, setActiveTab] = useState(1); 
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [nodes, setNodes] = useState([]); 
  const [records, setRecords] = useState({}); 
  const [targetLossPercent, setTargetLossPercent] = useState(48); 
  const [selectedMmIds, setSelectedMmIds] = useState([]); 

  const [customFormulas, setCustomFormulas] = useState([]);
  const [targetNodeId, setTargetNodeId] = useState('');
  const [sourceNodeIds, setSourceNodeIds] = useState([]);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('DMA'); 
  const [newParentId, setNewParentId] = useState('');

  const getDaysInSelectedMonth = (yearMonthStr) => {
    if (!yearMonthStr) return 30;
    const [year, month] = yearMonthStr.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInSelectedMonth(selectedMonth);

  const fetchData = async () => {
    try {
      const snap = await getDocs(collection(db, "network_nodes"));
      const nodeList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNodes(nodeList);

      if (selectedMmIds.length === 0 && nodeList.length > 0) {
        const mmNodes = nodeList.filter(n => n.type === 'MM');
        setSelectedMmIds(mmNodes.map(n => n.id));
      }

      const recSnap = await getDocs(collection(db, "monthly_network_records"));
      const recMap = {};
      recSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.monthYear === selectedMonth) {
          recMap[data.nodeId] = { qin: data.qin ?? '', qmeter: data.qmeter ?? '' };
        }
      });
      setRecords(recMap);

      const formulaSnap = await getDocs(collection(db, "dma_formulas"));
      const formulaList = formulaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomFormulas(formulaList);

    } catch (error) {
      console.error("Error fetching data: ", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const handleAddNode = async (e) => {
    e.preventDefault();
    if (!newName) return;
    if (newName.startsWith('P3')) {
      alert('ข้อมูลขึ้นต้นด้วย P3 เป็นข้อมูลแรงดัน ไม่ต้องนำมาบันทึกน้ำสูญเสียครับ');
      return;
    }
    try {
      await addDoc(collection(db, "network_nodes"), {
        name: newName, 
        type: newType, 
        parentId: newParentId || null 
      });
      setNewName('');
      setNewParentId('');
      fetchData();
      alert('เพิ่มโซนและผูกโครงสร้างสำเร็จ!');
    } catch (error) {
      console.error("Error adding node: ", error);
    }
  };

  const handleDeleteNodeAndChildren = async (targetNode) => {
    const getAllDescendantIds = (parentId, allNodes) => {
      let ids = [parentId];
      const children = allNodes.filter(n => n.parentId === parentId);
      for (let child of children) {
        ids = ids.concat(getAllDescendantIds(child.id, allNodes));
      }
      return ids;
    };

    const idsToDelete = getAllDescendantIds(targetNode.id, nodes);
    const confirmMsg = idsToDelete.length > 1 
      ? `⚠️ คุณต้องการลบ "${targetNode.name}" และโซนลูกหลานในสังกัดรวมทั้งหมด ${idsToDelete.length} โซน ใช่หรือไม่?`
      : `⚠️ คุณต้องการลบโซน "${targetNode.name}" ใช่หรือไม่?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      for (let id of idsToDelete) {
        await deleteDoc(doc(db, "network_nodes", id));
        const recSnap = await getDocs(collection(db, "monthly_network_records"));
        for (let recordDoc of recSnap.docs) {
          if (recordDoc.data().nodeId === id) {
            await deleteDoc(doc(db, "monthly_network_records", recordDoc.id));
          }
        }
      }
      alert('🗑️ ลบข้อมูลเรียบร้อยแล้ว!');
      fetchData();
    } catch (error) {
      console.error("Error deleting node: ", error);
      alert('เกิดข้อผิดพลาดในการลบข้อมูล');
    }
  };

  const handleInputChange = (nodeId, field, value) => {
    setRecords(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    try {
      for (let node of calculatedNodes) {
        const docId = `${selectedMonth}_${node.id}`;
        await setDoc(doc(db, "monthly_network_records", docId), {
          monthYear: selectedMonth,
          nodeId: node.id,
          name: node.name,
          type: node.type,
          qin: Number(node.qin) || 0,
          qmeter: Number(node.qmeter) || 0
        }, { merge: true });
      }
      alert('บันทึกข้อมูลสำเร็จ!');
      fetchData();
    } catch (error) {
      console.error("Error saving records: ", error);
    }
  };

  const toggleMmSelection = (id) => {
    setSelectedMmIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAddFormula = async (e) => {
    e.preventDefault();
    if (!targetNodeId || sourceNodeIds.length === 0) {
      alert('กรุณาเลือกโซนผลลัพธ์ (Target) และโซนองค์ประกอบอย่างน้อย 1 โซน');
      return;
    }
    try {
      await addDoc(collection(db, "dma_formulas"), {
        targetDmaId: targetNodeId,
        sourceDmaIds: sourceNodeIds
      });
      setTargetNodeId('');
      setSourceNodeIds([]);
      fetchData();
      alert('บันทึกสูตรสำเร็จ!');
    } catch (error) {
      console.error("Error adding formula: ", error);
    }
  };

  const handleDeleteFormula = async (formulaId) => {
    if (!window.confirm("คุณต้องการลบสูตรคำนวณนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, "dma_formulas", formulaId));
      fetchData();
    } catch (error) {
      console.error("Error deleting formula: ", error);
    }
  };

  const toggleSourceNodeSelection = (id) => {
    setSourceNodeIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getCalculatedQin = (nodeId, allNodes, recs, visited = new Set()) => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    const rec = recs[nodeId] || { qin: '' };
    if (rec.qin !== '' && rec.qin !== null && rec.qin !== undefined && !isNaN(rec.qin)) {
      return Number(rec.qin);
    }

    const formula = customFormulas.find(f => f.targetDmaId === nodeId);
    if (formula && formula.sourceDmaIds.length > 0) {
      return formula.sourceDmaIds.reduce((sum, srcId) => {
        return sum + getCalculatedQin(srcId, allNodes, recs, visited);
      }, 0);
    }

    const children = allNodes.filter(n => n.parentId === nodeId);
    if (children.length === 0) return 0;

    return children.reduce((sum, child) => {
      return sum + getCalculatedQin(child.id, allNodes, recs, visited);
    }, 0);
  };

  const getCalculatedQmeter = (nodeId, allNodes, recs, visited = new Set()) => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    const rec = recs[nodeId] || { qmeter: '' };
    if (rec.qmeter !== '' && rec.qmeter !== null && rec.qmeter !== undefined && !isNaN(rec.qmeter)) {
      return Number(rec.qmeter);
    }

    const formula = customFormulas.find(f => f.targetDmaId === nodeId);
    if (formula && formula.sourceDmaIds.length > 0) {
      return formula.sourceDmaIds.reduce((sum, srcId) => {
        return sum + getCalculatedQmeter(srcId, allNodes, recs, visited);
      }, 0);
    }

    const children = allNodes.filter(n => n.parentId === nodeId);
    if (children.length === 0) return 0;

    return children.reduce((sum, child) => {
      return sum + getCalculatedQmeter(child.id, allNodes, recs, visited);
    }, 0);
  };

  const calculatedNodes = nodes.map(node => {
    const qin = getCalculatedQin(node.id, nodes, records);
    const qmeter = getCalculatedQmeter(node.id, nodes, records);
    const lossVol = qin >= qmeter ? qin - qmeter : 0;
    const lossPct = qin > 0 ? (lossVol / qin) * 100 : 0;
    const isMmSelected = selectedMmIds.includes(node.id);

    return { ...node, qin, qmeter, lossVol, lossPct, isMmSelected };
  });

  const systemMmNodes = calculatedNodes.filter(n => n.type === 'MM' && n.isMmSelected);
  const totalQin = systemMmNodes.reduce((sum, n) => sum + n.qin, 0);
  const totalQmeter = systemMmNodes.reduce((sum, n) => sum + n.qmeter, 0);
  const totalLossVol = totalQin - totalQmeter;
  const currentOverallLossPct = totalQin > 0 ? (totalLossVol / totalQin) * 100 : 0;

  const targetTotalLossVol = (totalQin * targetLossPercent) / 100;
  const totalNeedToReduce = totalLossVol - targetTotalLossVol;

  const sortedNodes = [...calculatedNodes].sort((a, b) => b.lossVol - a.lossVol);

  const nodesWithTargets = sortedNodes.map(node => {
    let reduceTargetVol = 0;
    if (totalLossVol > 0 && totalNeedToReduce > 0) {
      const proportion = node.lossVol / totalLossVol;
      reduceTargetVol = totalNeedToReduce * proportion;
    }
    const targetLossRemaining = node.lossVol - reduceTargetVol;
    
    const monthlyOptimalQin = targetLossPercent < 100 ? node.qmeter / (1 - targetLossPercent / 100) : node.qin;
    const optimalQin = daysInMonth > 0 ? monthlyOptimalQin / daysInMonth : 0;

    return { ...node, reduceTargetVol, targetLossRemaining, optimalQin };
  });

  const rootNodes = nodes.filter(n => !n.parentId);
  const mmNodesList = nodes.filter(n => n.type === 'MM');

  const mmColorMap = {};
  mmNodesList.forEach((mm, index) => {
    mmColorMap[mm.id] = MM_COLORS[index % MM_COLORS.length];
  });

  const selectedMmNames = systemMmNodes.map(mm => mm.name).join(' + ');

  const tabStyle = (tabId) => ({
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: 'bold',
    background: activeTab === tabId ? '#3182ce' : '#edf2f7',
    color: activeTab === tabId ? 'white' : '#4a5568',
    border: 'none',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    fontSize: '14px',
    transition: '0.2s'
  });

  const formatNumWithComma = (val) => {
    const num = Number(val) || 0;
    if (Math.abs(num) >= 100) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return num.toFixed(2);
  };

  const getRootMmId = (currNode, nodesList) => {
    if (!currNode.parentId) return currNode.type === 'MM' ? currNode.id : null;
    const parent = nodesList.find(n => n.id === currNode.parentId);
    if (!parent) return null;
    return getRootMmId(parent, nodesList);
  };

  return (
    <div style={{ padding: '25px', fontFamily: 'sans-serif', maxWidth: '1550px', margin: 'auto', background: '#fdfdfd' }}>
      <h2 style={{ color: '#1a365d', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
        🌊 แดชบอร์ดบริหารจัดการน้ำสูญเสีย (NRW Management Dashboard)
      </h2>

      {/* เลือกเดือน */}
      <div style={{ margin: '15px 0', background: '#f8fafc', padding: '12px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
        <label><strong>ประจำเดือน/ปี: </strong></label>
        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e0', marginLeft: '10px' }} />
        <span style={{ marginLeft: '15px', fontSize: '13px', color: '#4a5568' }}>
          (เดือนนี้มี <strong>{daysInMonth} วัน</strong>)
        </span>
      </div>

      {/* --- แถบเมนูด้านบน (Tabs) --- */}
      <div style={{ display: 'flex', gap: '5px', borderBottom: '2px solid #3182ce', marginTop: '15px' }}>
        <button style={tabStyle(1)} onClick={() => setActiveTab(1)}>
          ⚙️ 1. กำหนดสูตรคำนวณ (MM & DMA Formulas)
        </button>
        <button style={tabStyle(2)} onClick={() => setActiveTab(2)}>
          🌳 2. แผนผังโครงสร้าง Tree
        </button>
        <button style={tabStyle(3)} onClick={() => setActiveTab(3)}>
          📊 3. สรุปผลและตารางเร่งด่วน
        </button>
      </div>

      {/* --- เนื้อหาในแต่ละแท็บ --- */}
      <div style={{ background: 'white', padding: '20px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', minHeight: '400px' }}>
        
        {/* TAB 1 */}
        {activeTab === 1 && (
          <div>
            <div style={{ background: '#fffaf0', padding: '15px 20px', borderRadius: '8px', border: '1px solid #feebc8', marginBottom: '25px' }}>
              <h3 style={{ color: '#9c4221', marginTop: '0' }}>1. กำหนดสูตรคำนวณภาพรวมระบบ (เฉพาะสถานี MM)</h3>
              <p style={{ color: '#718096', fontSize: '14px' }}>เลือกสถานีหลัก (MM) ที่ต้องการให้นำมารวมคำนวณอัตราน้ำสูญเสียและเป้าหมายของทั้งระบบ</p>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '15px' }}>
                {mmNodesList.length === 0 ? (
                  <p style={{ color: '#e53e3e', fontSize: '14px' }}>ยังไม่มีสถานี MM ในระบบ กรุณาเพิ่มโซนประเภท MM ในแท็บแผนผัง Tree</p>
                ) : (
                  mmNodesList.map(mm => (
                    <label key={mm.id} style={{ cursor: 'pointer', background: 'white', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '14px', fontWeight: 'bold' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedMmIds.includes(mm.id)}
                        onChange={() => toggleMmSelection(mm.id)}
                        style={{ marginRight: '8px' }}
                      />
                      {mm.name}
                    </label>
                  ))
                )}
              </div>

              <div style={{ marginTop: '15px', padding: '10px 15px', background: 'white', borderRadius: '6px', border: '1px solid #f6ad55', fontSize: '15px', color: '#7b341e', fontWeight: 'bold' }}>
                📐 อัตราน้ำสูญเสียทั้งหมด = {selectedMmNames ? selectedMmNames : '(ยังไม่ได้เลือกสถานี MM)'}
              </div>
            </div>

            <div style={{ background: '#f0fdf4', padding: '15px 20px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <h3 style={{ color: '#166534', marginTop: '0' }}>2. กำหนดสูตรคำนวณระดับ MM หรือ DMA (Custom Formulas)</h3>
              <p style={{ color: '#15803d', fontSize: '14px' }}>สร้างสูตรบวกผลรวมระหว่างโซน (รองรับทั้ง MM และ DMA)</p>

              <form onSubmit={handleAddFormula} style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginTop: '15px', background: 'white', padding: '15px', borderRadius: '6px', border: '1px solid #d1fae5' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}><strong>โซนผลลัพธ์ (Target):</strong></label>
                  <select value={targetNodeId} onChange={(e) => setTargetNodeId(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                    <option value="">-- เลือกโซนปลายทาง --</option>
                    {nodes.map(n => <option key={n.id} value={n.id}>[{n.type}] {n.name}</option>)}
                  </select>
                </div>

                <div style={{ flex: 1, minWidth: '300px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}><strong>เลือกโซนที่จะนำมารวมกัน (+):</strong></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: '120px', overflowY: 'auto', padding: '5px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                    {nodes.filter(n => n.id !== targetNodeId).map(n => (
                      <label key={n.id} style={{ fontSize: '13px', cursor: 'pointer', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                        <input 
                          type="checkbox" 
                          checked={sourceNodeIds.includes(n.id)}
                          onChange={() => toggleSourceNodeSelection(n.id)}
                          style={{ marginRight: '4px' }}
                        />
                        [{n.type}] {n.name}
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" style={{ padding: '8px 15px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '38px', alignSelf: 'flex-end' }}>
                  + เพิ่มสูตร
                </button>
              </form>

              <div style={{ marginTop: '15px' }}>
                <h4 style={{ color: '#166534', margin: '10px 0' }}>📋 รายการสูตรคำนวณปัจจุบัน:</h4>
                {customFormulas.length === 0 ? (
                  <p style={{ color: '#718096', fontSize: '13px' }}>ยังไม่มีสูตร Custom Formula ในระบบ</p>
                ) : (
                  <ul style={{ paddingLeft: '20px', margin: '0' }}>
                    {customFormulas.map(formula => {
                      const targetNode = nodes.find(n => n.id === formula.targetDmaId);
                      const sourceNames = formula.sourceDmaIds.map(srcId => {
                        const sNode = nodes.find(n => n.id === srcId);
                        return sNode ? sNode.name : '';
                      }).filter(Boolean).join(' + ');

                      return (
                        <li key={formula.id} style={{ margin: '5px 0', fontSize: '14px' }}>
                          <strong>{targetNode ? `[${targetNode.type}] ${targetNode.name}` : 'Unknown'}</strong> = {sourceNames} 
                          <button 
                            onClick={() => handleDeleteFormula(formula.id)}
                            style={{ marginLeft: '10px', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            ลบสูตร ❌
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: แผนผังโครงสร้าง Tree */}
        {activeTab === 2 && (
          <div>
            <h3 style={{ color: '#2d3748', marginTop: '0' }}>🌳 แผนผังโครงสร้างการจ่ายน้ำ (แยกสีตามสถานี MM)</h3>
            <p style={{ fontSize: '13px', color: '#e53e3e', margin: '0 0 15px 0' }}>
              💡 <em>คำแนะนำ: ดับเบิลคลิกที่ชื่อโซนในแผนผังเพื่อลบ (หากลบ MM หรือแม่ จะทำการลบลูกหลานทั้งหมดในสังกัดออกด้วยอัตโนมัติ)</em>
            </p>

            <form onSubmit={handleAddNode} style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}><strong>ชื่อโซน (MM / DMA):</strong></label>
                <input type="text" placeholder="เช่น MM-01 หรือ DMA-04" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}><strong>ประเภท:</strong></label>
                <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                  <option value="MM">MM (สถานีหลัก)</option>
                  <option value="DMA">DMA (พื้นที่ย่อย)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}><strong>เชื่อมโยงสังกัดแม่ (Parent):</strong></label>
                <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                  <option value="">-- เป็นแม่สูงสุด (Top Level / MM) --</option>
                  {nodes.map(n => <option key={n.id} value={n.id}>[{n.type}] {n.name}</option>)}
                </select>
              </div>
              <button type="submit" style={{ padding: '8px 15px', background: '#3182ce', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '35px' }}>
                + เพิ่มโซนและผูกโครงสร้าง
              </button>
            </form>

            {nodes.length === 0 ? (
              <p style={{ color: '#718096' }}>ยังไม่มีข้อมูลโครงสร้างโซน กรุณาเพิ่มข้อมูลด้านบน</p>
            ) : (
              <ul style={{ paddingLeft: '0', margin: '0' }}>
                {rootNodes.map(root => (
                  <TreeNode key={root.id} node={root} allNodes={nodes} records={records} onDeleteNode={handleDeleteNodeAndChildren} mmColorMap={mmColorMap} />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* TAB 3: สรุปผลภาพรวมระบบ และตารางรายงานแยกตาม MM */}
        {activeTab === 3 && (
          <div>
            <div style={{ background: 'linear-gradient(135deg, #ebf8ff 0%, #eef2f7 100%)', padding: '20px 25px', borderRadius: '12px', border: '1px solid #bee3f8', marginBottom: '25px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#1e3a8a', fontSize: '18px' }}>📊 สรุปผลการดำเนินงานภาพรวมระบบประจำเดือน {selectedMonth}</h3>
              <p style={{ fontSize: '13px', color: '#4a5568', fontStyle: 'italic', marginBottom: '10px' }}>
                สูตรคำนวณ: อัตราน้ำสูญเสียทั้งหมด = {selectedMmNames ? selectedMmNames : 'ไม่มีการเลือก MM'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', margin: '12px 0' }}>
                <div style={{ background: 'white', padding: '12px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#718096' }}>น้ำจ่ายต้นทางรวม (มาตร DMA)</span>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2b6cb0' }}>{totalQin.toLocaleString()} คิว</div>
                </div>
                <div style={{ background: 'white', padding: '12px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#718096' }}>น้ำจำหน่ายรวม</span>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2f855a' }}>{totalQmeter.toLocaleString()} คิว</div>
                </div>
                <div style={{ background: 'white', padding: '12px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#718096' }}>อัตราน้ำสูญเสียปัจจุบัน</span>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: currentOverallLossPct > targetLossPercent ? '#e53e3e' : '#38a169' }}>
                    {currentOverallLossPct.toFixed(2)}% ({totalLossVol.toLocaleString()} คิว)
                  </div>
                </div>
              </div>

              <div style={{ margin: '15px 0 10px 0', display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'inline-flex' }}>
                <label style={{ fontSize: '14px', color: '#2d3748' }}><strong>เป้าหมายน้ำสูญเสียภาพรวมที่ต้องการ (%):</strong></label>
                <input 
                  type="number" 
                  value={targetLossPercent} 
                  onChange={(e) => setTargetLossPercent(Number(e.target.value))}
                  style={{ width: '70px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e0', textAlign: 'center', fontWeight: 'bold' }}
                />
              </div>
              <div style={{ color: '#c53030', fontWeight: 'bold', fontSize: '15px', marginTop: '8px' }}>
                🎯 ปริมาณน้ำสูญเสียที่ต้องลดลงเพิ่มทั้งระบบ: {totalNeedToReduce > 0 ? formatNumWithComma(totalNeedToReduce) : '0.00'} คิว
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: '#1e293b', margin: '0', fontSize: '17px' }}>📋 ตารางรายงานและจัดลำดับพื้นที่เร่งด่วน (แยกตามสถานี MM)</h3>
              <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', color: '#991b1b' }}>
                  🔴 อันดับ 1 (สูญเสียสูงสุด)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fffbeb', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', color: '#92400e' }}>
                  🟠 อันดับ 2 (สูญเสียสูง)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px', color: '#475569' }}>
                  ⚪ ปกติ
                </span>
              </div>
            </div>

            {mmNodesList.length === 0 ? (
              <p style={{ color: '#718096' }}>ยังไม่มีสถานี MM ในระบบ กรุณาเพิ่มข้อมูลในแท็บแผนผัง Tree</p>
            ) : (
              mmNodesList.map((mmNode) => {
                const mmTheme = mmColorMap[mmNode.id] || MM_COLORS[0];
                
                const mmGroupNodes = nodesWithTargets.filter(n => {
                  const rootId = getRootMmId(n, nodes);
                  return n.id === mmNode.id || rootId === mmNode.id;
                });

                if (mmGroupNodes.length === 0) return null;

                // 📌 เปลี่ยนการเรียงลำดับใหม่: เรียงตามเปอร์เซ็นต์น้ำสูญเสีย (lossPct) จากมากไปน้อยในแต่ละ MM
                const sortedMmGroupNodes = [...mmGroupNodes].sort((a, b) => b.lossPct - a.lossPct);

                return (
                  <div key={mmNode.id} style={{ marginBottom: '35px', border: `1px solid #e2e8f0`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', background: 'white' }}>
                    {/* หัวข้อสถานี MM */}
                    <div style={{ background: mmTheme.bg, padding: '14px 20px', borderBottom: `1px solid ${mmTheme.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ background: mmTheme.badge, color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        MM STATION
                      </span>
                      <h4 style={{ margin: '0', color: '#0f172a', fontSize: '16px', fontWeight: '700' }}>{mmNode.name}</h4>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', background: 'white', fontSize: '14px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0', fontSize: '13px' }}>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>ลำดับ</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>ประเภท</th>
                            <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '600' }}>ชื่อโซน</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>มาตร DMA (คิว)</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>น้ำจำหน่าย (คิว)</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>สูญเสียปัจจุบัน (คิว)</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>สูญเสียปัจจุบัน (%)</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>เป้าหมายภาพรวม (%)</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>สถานะเทียบเป้า</th>
                            <th style={{ padding: '12px 10px', fontWeight: '600' }}>เป้าหมายต้องลดลงต่อเดือน (คิว)</th>
                            <th style={{ padding: '12px 10px', background: '#eff6ff', color: '#1e40af', fontWeight: '700' }}>น้ำจ่ายรายวันที่เหมาะสม (คิว/วัน)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedMmGroupNodes.map((node, index) => {
                            const isLossHigher = node.lossPct > targetLossPercent;
                            // เงื่อนไข: เป้าหมายน้ำสูญเสียมากกว่าหรือเท่ากับสูญเสียปัจจุบัน (targetLossPercent >= node.lossPct) จะไม่แสดงข้อมูล 2 ช่องสุดท้าย
                            const isTargetLowerThanCurrent = targetLossPercent < node.lossPct;

                            return (
                              <tr key={node.id} style={{ borderBottom: '1px solid #f1f5f9', background: index === 0 && isLossHigher ? '#fef2f2' : index === 1 && isLossHigher ? '#fffbeb' : 'white' }}>
                                <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#64748b' }}>{index + 1}</td>
                                <td style={{ padding: '12px 10px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', background: node.type === 'MM' ? '#dbeafe' : '#f1f5f9', color: node.type === 'MM' ? '#1e40af' : '#475569' }}>
                                    {node.type}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 10px', textAlign: 'left', fontWeight: '600', color: '#1e293b' }}>{node.name}</td>
                                <td style={{ padding: '12px 10px' }}>{node.qin ? formatNumWithComma(node.qin) : '-'}</td>
                                <td style={{ padding: '12px 10px' }}>{node.qmeter ? formatNumWithComma(node.qmeter) : '-'}</td>
                                <td style={{ padding: '12px 10px', fontWeight: '600', color: '#b91c1c' }}>{node.lossVol ? formatNumWithComma(node.lossVol) : '-'}</td>
                                <td style={{ padding: '12px 10px', fontWeight: 'bold', color: isLossHigher ? '#dc2626' : '#16a34a' }}>
                                  {node.lossPct ? `${node.lossPct.toFixed(2)}%` : '0.00%'}
                                </td>
                                <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#2563eb' }}>{targetLossPercent}%</td>
                                <td style={{ padding: '12px 10px' }}>
                                  {isLossHigher ? (
                                    <span style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                                      🔴 สูงกว่าเป้า
                                    </span>
                                  ) : (
                                    <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                                      🟢 ผ่านเกณฑ์
                                    </span>
                                  )}
                                </td>
                                {/* เป้าหมายต้องลดลงต่อเดือน (คิว) */}
                                <td style={{ padding: '12px 10px', fontWeight: 'bold', color: isTargetLowerThanCurrent ? '#dc2626' : '#94a3b8' }}>
                                  {isTargetLowerThanCurrent ? formatNumWithComma(node.reduceTargetVol) : '-'}
                                </td>
                                {/* น้ำจ่ายรายวันที่เหมาะสม (คิว/วัน) */}
                                <td style={{ padding: '12px 10px', background: isTargetLowerThanCurrent ? '#f8fafc' : '#fafafa', fontWeight: 'bold', color: isTargetLowerThanCurrent ? '#1d4ed8' : '#94a3b8' }}>
                                  {isTargetLowerThanCurrent ? formatNumWithComma(node.optimalQin) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WaterLossDashboard;
