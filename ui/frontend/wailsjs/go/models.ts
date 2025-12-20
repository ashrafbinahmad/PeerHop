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

export namespace utils {
	
	export class AppInfo {
	    name: string;
	    command: string;
	    icon?: string;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.command = source["command"];
	        this.icon = source["icon"];
	    }
	}

}

