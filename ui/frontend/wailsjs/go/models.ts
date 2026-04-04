export namespace main {
	
	export class ServerInfo {
	    url: string;
	    filename: string;
	    size: number;
	    ssid: string;
	    hotspotSsid: string;
	    hotspotPassword: string;
	    networks: network.NetworkProfile[];
	
	    static createFrom(source: any = {}) {
	        return new ServerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.size = source["size"];
	        this.ssid = source["ssid"];
	        this.hotspotSsid = source["hotspotSsid"];
	        this.hotspotPassword = source["hotspotPassword"];
	        this.networks = this.convertValues(source["networks"], network.NetworkProfile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ShareData {
	    files: string[];
	    text: string;
	    url: string;
	    title: string;
	
	    static createFrom(source: any = {}) {
	        return new ShareData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = source["files"];
	        this.text = source["text"];
	        this.url = source["url"];
	        this.title = source["title"];
	    }
	}

}

export namespace network {
	
	export class NetworkProfile {
	    name: string;
	    ip: string;
	    ssid: string;
	    password?: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.ip = source["ip"];
	        this.ssid = source["ssid"];
	        this.password = source["password"];
	        this.type = source["type"];
	    }
	}

}

export namespace server {
	
	export class SecuritySettings {
	    securityToken: string;
	    adminToken: string;
	    securityEnabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SecuritySettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.securityToken = source["securityToken"];
	        this.adminToken = source["adminToken"];
	        this.securityEnabled = source["securityEnabled"];
	    }
	}

}

