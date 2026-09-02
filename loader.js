(function(){
    var hostUrl = 'https://onrender.com';
    var containerId = 'sys-overlay-root';
    var existing = document.getElementById(containerId);
    
    if (existing) {
        existing.style.display = existing.style.display === 'none' ? 'flex' : 'none';
        return;
    }
    
    var box = document.createElement('div');
    box.id = containerId;
    Object.assign(box.style, {
        position: 'fixed',
        top: '40px',
        right: '40px',
        width: '850px',
        height: '550px',
        zIndex: '2147483647',
        boxShadow: '0 15px 50px rgba(0,0,0,0.6)',
        borderRadius: '8px',
        backgroundColor: '#242428',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #323238',
        fontFamily: 'sans-serif'
    });
    
    var titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
        backgroundColor: '#242428',
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #323238'
    });
    
    var txt = document.createElement('span');
    txt.innerText = 'Enterprise Application Network';
    txt.style.color = '#fff';
    txt.style.fontSize = '13px';
    txt.style.fontWeight = '600';
    
    var close = document.createElement('button');
    close.innerText = '✕';
    Object.assign(close.style, {
        background: 'none',
        border: 'none',
        color: '#aaa',
        cursor: 'pointer', // FIXED: Added proper quotation marks to avoid reference exception
        fontSize: '16px'
    });
    
    close.onclick = function() {
        document.body.removeChild(box);
    };
    
    titleBar.appendChild(txt);
    titleBar.appendChild(close);
    
    var webFrame = document.createElement('iframe');
    Object.assign(webFrame.style, {
        width: '100%',
        flexGrow: '1',
        border: 'none',
        backgroundColor: '#fff'
    });
    
    webFrame.setAttribute('sandbox', 'allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts');
    webFrame.src = hostUrl;
    
    box.appendChild(titleBar);
    box.appendChild(webFrame);
    document.body.appendChild(box);
})();
