export namespace main {
	
	export class ServerInfo {
	    url: string;
	    filename: string;
	    size: number;
	    ssid: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.size = source["size"];
	        this.ssid = source["ssid"];
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

