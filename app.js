const brokerInput = document.getElementById('broker');
const topicInput = document.getElementById('topic');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusPill = document.getElementById('statusPill');
const frameImg = document.getElementById('frameImg');
const logEl = document.getElementById('log');
const framesCountEl = document.getElementById('framesCount');
const lastSizeEl = document.getElementById('lastSize');
const payloadSizeEl = document.getElementById('payloadSize');
const fpsEl = document.getElementById('fps');
const connectedSinceEl = document.getElementById('connectedSince');
const clientIdEl = document.getElementById('clientId');
const brokerLabel = document.getElementById('brokerLabel');
const topicLabel = document.getElementById('topicLabel');
const frameTimeEl = document.getElementById('frameTime');
const latencyEl = document.getElementById('latency');
const avgLatencyEl = document.getElementById('avgLatency');

let client = null;
let frames = 0;
let lastSize = 0;
let frameTimes = [];
let lastUrl = null;
let connectedAt = null;
let lastFrameReceivedAt = null;
let latencies = [];

function log(...args){
  const s = args.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${s}\n` + logEl.textContent;
}

function setStatus(connected){
  if(connected){
    statusPill.classList.remove('disconnected');
    statusPill.classList.add('connected');
    statusPill.textContent = 'Connected';
  } else {
    statusPill.classList.remove('connected');
    statusPill.classList.add('disconnected');
    statusPill.textContent = 'Disconnected';
  }
}

function updateStats(){
  framesCountEl.textContent = frames;
  lastSizeEl.textContent = (lastSize > 0) ? (lastSize + ' bytes') : '—';
  payloadSizeEl.textContent = lastSize > 0 ? lastSize : '—';
  const now = performance.now();
  frameTimes = frameTimes.filter(t => now - t <= 1000);
  fpsEl.textContent = frameTimes.length;
  if(connectedAt) connectedSinceEl.textContent = new Date(connectedAt).toLocaleTimeString();
  clientIdEl.textContent = client && client.options ? client.options.clientId : '—';
  if(latencies.length > 0){
    const sum = latencies.reduce((a, b) => a + b, 0);
    avgLatencyEl.textContent = Math.round(sum / latencies.length);
  } else {
    avgLatencyEl.textContent = '—';
  }
}

function createClient(brokerUrl){
  const cid = 'vasuCAM-web-' + Math.random().toString(16).slice(2, 10);
  clientIdEl.textContent = cid;
  const opts = {
    clientId: cid,
    reconnectPeriod: 2000,
    connectTimeout: 30 * 1000,
    keepalive: 60
  };

  log('Connecting to', brokerUrl);
  brokerLabel.textContent = brokerUrl;
  client = mqtt.connect(brokerUrl, opts);

  client.on('connect', function(connack){
    log('Connected', connack);
    setStatus(true);
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    connectedAt = Date.now();
    updateStats();

    const topic = topicInput.value.trim();
    if(topic){
      client.subscribe(topic, { qos: 0 }, function(err, granted){
        if(err) log('Subscribe error:', err);
        else log('Subscribed to', topic, granted);
        topicLabel.textContent = topic;
      });
    }
  });

  client.on('reconnect', function(){
    log('Reconnecting...');
    setStatus(false);
    connectBtn.disabled = true;
    disconnectBtn.disabled = true;
  });

  client.on('close', function(){
    log('Connection closed');
    setStatus(false);
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  });

  client.on('offline', function(){
    log('Client offline');
    setStatus(false);
  });

  client.on('error', function(err){
    log('Error', err && err.message || err);
  });

  client.on('message', function(topic, message){
    try {
      const now = Date.now();
      const bytes = new Uint8Array(message);
      lastSize = bytes.byteLength;
      frames++;
      frameTimes.push(performance.now());

      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const prev = lastUrl;
      lastUrl = url;

      frameImg.src = url;
      frameImg.onload = function(){
        if(prev) URL.revokeObjectURL(prev);
      };

      frameTimeEl.textContent = new Date(now).toLocaleTimeString();

      if(lastFrameReceivedAt){
        const latency = now - lastFrameReceivedAt;
        latencyEl.textContent = latency + ' ms';
        latencies.push(latency);
        if(latencies.length > 50) latencies.shift();
      } else {
        latencyEl.textContent = '—';
      }
      lastFrameReceivedAt = now;

      updateStats();
    } catch(e){
      log('Frame processing error', e);
    }
  });

  return client;
}

connectBtn.addEventListener('click', function(){
  const brokerUrl = brokerInput.value.trim();
  if(!brokerUrl){
    alert('Enter broker URL (e.g. wss://test.mosquitto.org:8081)');
    return;
  }
  if(client && client.connected){
    log('Already connected');
    return;
  }
  client = createClient(brokerUrl);
});

disconnectBtn.addEventListener('click', function(){
  if(!client) return;
  try {
    client.end(true, () => {
      log('Disconnected cleanly');
      setStatus(false);
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
    });
  } catch(e){
    log('Error disconnecting', e);
  }
});

topicInput.addEventListener('keydown', function(e){
  if(e.key === 'Enter' && client && client.connected){
    const t = topicInput.value.trim();
    if(t){
      client.subscribe(t, { qos: 0 }, (err, granted) => {
        if(err) log('Subscribe error', err);
        else {
          log('Subscribed to', t, granted);
          topicLabel.textContent = t;
        }
      });
    }
  }
});

window.addEventListener('load', () => {
  const defaultBroker = brokerInput.value.trim();
  try {
    client = createClient(defaultBroker);
  } catch(e){
    log('Auto-connect failed', e);
  }
  updateStats();
});

window.addEventListener('beforeunload', () => {
  if(lastUrl) URL.revokeObjectURL(lastUrl);
  if(client) client.end(true);
});