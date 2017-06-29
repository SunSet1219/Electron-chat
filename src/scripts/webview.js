import { EventEmitter } from 'events';
import servers from './servers';
import sidebar from './sidebar';
import { desktopCapturer, ipcRenderer } from 'electron';

class WebView extends EventEmitter {
    constructor () {
        super();

        this.webviewParentElement = document.body;

        servers.forEach((host) => {
            this.add(host);
        });

        servers.on('host-added', (hostUrl) => {
            this.add(servers.get(hostUrl));
        });

        servers.on('host-removed', (hostUrl) => {
            this.remove(hostUrl);
        });

        servers.on('active-setted', (hostUrl) => {
            this.setActive(hostUrl);
        });

        servers.on('active-cleared', (hostUrl) => {
            this.deactiveAll(hostUrl);
        });

        servers.once('loaded', () => {
            this.loaded();
        });

        ipcRenderer.on('screenshare-result', (e, result) => {
            const webviewObj = this.getActive();
            webviewObj.executeJavaScript(`
                window.parent.postMessage({
                    sourceId: '${result}'
                }, '*')
            `);
        });
    }

    loaded () {
        document.querySelector('#loading').style.display = 'none';
        document.querySelector('#login-card').style.display = 'block';
        document.querySelector('footer').style.display = 'block';
    }

    loading () {
        document.querySelector('#loading').style.display = 'block';
        document.querySelector('#login-card').style.display = 'none';
        document.querySelector('footer').style.display = 'none';
    }

    add (host) {
        var webviewObj = this.getByUrl(host.url);
        if (webviewObj) {
            return;
        }

        webviewObj = document.createElement('webview');
        webviewObj.setAttribute('server', host.url);
        webviewObj.setAttribute('preload', './preload.js');
        webviewObj.setAttribute('allowpopups', 'on');
        webviewObj.setAttribute('disablewebsecurity', 'on');

        webviewObj.addEventListener('did-navigate-in-page', (lastPath) => {
            this.saveLastPath(host.url, lastPath.url);
        });

        webviewObj.addEventListener('console-message', function (e) {
            console.log('webview:', e.message);
        });

        webviewObj.addEventListener('ipc-message', (event) => {
            this.emit('ipc-message-'+event.channel, host.url, event.args);

            switch (event.channel) {
                case 'title-changed':
                    servers.setHostTitle(host.url, event.args[0]);
                    break;
                case 'unread-changed':
                    sidebar.setBadge(host.url, event.args[0]);
                    break;
                case 'focus':
                    servers.setActive(host.url);
                    break;
                case 'get-sourceId':
                    desktopCapturer.getSources({types: ['window', 'screen']}, (error, sources) => {
                        if (error) {
                            throw error;
                        }

                        sources = sources.map(source => {
                            source.thumbnail = source.thumbnail.toDataURL();
                            return source;
                        });
                        ipcRenderer.send('screenshare', sources);
                    });
                    break;
                case 'reload-server':
                    const active = this.getActive();
                    const server = active.getAttribute('server');
                    this.loading();
                    active.loadURL(server);
                    break;
            }
        });

        webviewObj.addEventListener('dom-ready', () => {
            this.emit('dom-ready', host.url);
        });

        webviewObj.addEventListener('did-fail-load', (e) => {
            if (e.isMainFrame) {
                webviewObj.loadURL('file://' + __dirname + '/loading-error.html');
            }
        });

        webviewObj.addEventListener('did-get-response-details', (e) => {
            if (e.resourceType === 'mainFrame' && e.httpResponseCode >= 500) {
                webviewObj.loadURL('file://' + __dirname + '/loading-error.html');
            }
        });

        this.webviewParentElement.appendChild(webviewObj);

        webviewObj.src = host.lastPath || host.url;
    }

    remove (hostUrl) {
        var el = this.getByUrl(hostUrl);
        if (el) {
            el.remove();
        }
    }

    saveLastPath (hostUrl, lastPathUrl) {
        var hosts = servers.hosts;
        hosts[hostUrl].lastPath = lastPathUrl;
        servers.hosts = hosts;
    }

    getByUrl (hostUrl) {
        return this.webviewParentElement.querySelector(`webview[server="${hostUrl}"]`);
    }

    getActive () {
        return document.querySelector('webview.active');
    }

    isActive (hostUrl) {
        return !!this.webviewParentElement.querySelector(`webview.active[server="${hostUrl}"]`);
    }

    deactiveAll () {
        var item;
        while (!(item = this.getActive()) === false) {
            item.classList.remove('active');
        }
        document.querySelector('.landing-page').classList.add('hide');
    }

    showLanding () {
        this.loaded();
        document.querySelector('.landing-page').classList.remove('hide');
    }

    setActive (hostUrl) {
        console.log('active setted', hostUrl);
        if (this.isActive(hostUrl)) {
            return;
        }

        this.deactiveAll();
        var item = this.getByUrl(hostUrl);
        if (item) {
            item.classList.add('active');
        }

        this.focusActive();
    }

    focusActive () {
        var active = this.getActive();
        if (active) {
            active.focus();
            return true;
        }
        return false;
    }
}

export default new WebView();
