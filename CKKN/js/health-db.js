/*
 * Đồng bộ CKKN với Supabase.
 * Dữ liệu vẫn được giữ trong localStorage để CKKN hoạt động khi offline;
 * khi có phiên đăng nhập Supabase, các thay đổi sẽ được upsert lên health_records.
 */
const HEALTH_SUPABASE_URL = 'https://ghdydszifdaiphcjguri.supabase.co';
const HEALTH_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c';

let healthSupabaseClient = null;
let healthUserId = null;

function healthRecordKey(type, id) {
  return `${type}:${id}`;
}

function cycleToHealthPayload(cycle) {
  return {
    id: cycle.id,
    user_id: healthUserId,
    record_type: 'cycle',
    record_date: cycle.start,
    end_date: cycle.end || null,
    symptoms: Array.isArray(cycle.symptoms) ? cycle.symptoms : [],
    pain: cycle.pain || null,
    mood: Array.isArray(cycle.mood) ? cycle.mood : [],
    note: cycle.note || null
  };
}

function relationToHealthPayload(relation) {
  return {
    id: relation.id,
    user_id: healthUserId,
    record_type: 'relation',
    record_date: relation.date,
    event_time: relation.time || null,
    protection: relation.protection || null,
    methods: Array.isArray(relation.methods) ? relation.methods : [],
    feeling: relation.feeling || null,
    note: relation.note || null
  };
}

function healthRowToCycle(row) {
  return {
    id: row.id,
    start: row.record_date,
    end: row.end_date || '',
    symptoms: Array.isArray(row.symptoms) ? row.symptoms : [],
    pain: row.pain || '',
    mood: Array.isArray(row.mood) ? row.mood : [],
    note: row.note || '',
    createdAt: Date.parse(row.created_at) || Date.now()
  };
}

function healthRowToRelation(row) {
  return {
    id: row.id,
    date: row.record_date,
    time: row.event_time ? String(row.event_time).slice(0, 5) : '',
    protection: row.protection || '',
    methods: Array.isArray(row.methods) ? row.methods : [],
    feeling: row.feeling || '',
    note: row.note || '',
    createdAt: Date.parse(row.created_at) || Date.now()
  };
}

async function syncHealthRecordsFromSupabase() {
  if (!healthSupabaseClient || !healthUserId) return;

  const localCycles = Array.isArray(cycles) ? [...cycles] : [];
  const localRelations = Array.isArray(relations) ? [...relations] : [];
  const { data, error } = await healthSupabaseClient
    .from('health_records')
    .select('*')
    .eq('user_id', healthUserId)
    .order('record_date', { ascending: false });

  if (error) {
    console.error('Không thể tải dữ liệu sức khỏe từ Supabase:', error);
    return;
  }

  const remoteRows = Array.isArray(data) ? data : [];
  const remoteKeys = new Set(remoteRows.map(row => healthRecordKey(row.record_type, row.id)));
  const localRows = [
    ...localCycles.filter(item => !remoteKeys.has(healthRecordKey('cycle', item.id))).map(cycleToHealthPayload),
    ...localRelations.filter(item => !remoteKeys.has(healthRecordKey('relation', item.id))).map(relationToHealthPayload)
  ];

  if (localRows.length) {
    const { error: uploadError } = await healthSupabaseClient
      .from('health_records')
      .upsert(localRows, { onConflict: 'user_id,id' });
    if (uploadError) {
      console.error('Không thể đồng bộ dữ liệu sức khỏe cục bộ:', uploadError);
    } else {
      remoteRows.push(...localRows.map(row => ({
        ...row,
        created_at: new Date().toISOString()
      })));
    }
  }

  cycles = remoteRows.filter(row => row.record_type === 'cycle').map(healthRowToCycle);
  relations = remoteRows.filter(row => row.record_type === 'relation').map(healthRowToRelation);
  localStorage.setItem(CYCLE_KEY, JSON.stringify(cycles));
  localStorage.setItem(RELATION_KEY, JSON.stringify(relations));
}

async function initHealthDatabase() {
  if (typeof supabase === 'undefined') {
    console.warn('Supabase SDK chưa được tải. CKKN sẽ chỉ lưu cục bộ.');
    return;
  }

  try {
    const clientOwner = window.parent && window.parent !== window ? window.parent : window;
    healthSupabaseClient = clientOwner.__QLCT_SUPABASE_CLIENT || supabase.createClient(HEALTH_SUPABASE_URL, HEALTH_SUPABASE_KEY);
    clientOwner.__QLCT_SUPABASE_CLIENT = healthSupabaseClient;
    const { data: { session } } = await healthSupabaseClient.auth.getSession();
    healthUserId = session?.user?.id || null;

    if (healthUserId) await syncHealthRecordsFromSupabase();

    healthSupabaseClient.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      if (nextUserId === healthUserId) return;
      healthUserId = nextUserId;
      if (healthUserId) {
        syncHealthRecordsFromSupabase().then(() => {
          renderCycles();
          updateCycleStats();
          updateCyclePredict();
          renderRelations();
          updateRelationStats();
          if (typeof updateRelationSafety === 'function') updateRelationSafety();
        });
      }
    });
  } catch (error) {
    console.error('Không thể khởi tạo kết nối Supabase cho CKKN:', error);
  }
}

function saveHealthRecord(type, record) {
  if (!healthSupabaseClient || !healthUserId || !record) return;
  const payload = type === 'cycle'
    ? cycleToHealthPayload(record)
    : relationToHealthPayload(record);

  healthSupabaseClient
    .from('health_records')
    .upsert([payload], { onConflict: 'user_id,id' })
    .then(({ error }) => {
      if (error) console.error('Không thể lưu dữ liệu sức khỏe:', error);
    });
}

function deleteHealthRecord(type, id) {
  if (!healthSupabaseClient || !healthUserId || !id) return;
  healthSupabaseClient
    .from('health_records')
    .delete()
    .eq('user_id', healthUserId)
    .eq('record_type', type)
    .eq('id', id)
    .then(({ error }) => {
      if (error) console.error('Không thể xóa dữ liệu sức khỏe:', error);
    });
}
