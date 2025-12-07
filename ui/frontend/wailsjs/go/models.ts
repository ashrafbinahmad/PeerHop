export namespace main {
	
	export class ServerInfo {
	    url: string;
	    filename: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new ServerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.size = source["size"];
	    }
	}

}

