import axios from 'axios';

export interface MetaData {
    mode: 'download' | 'upload';
    filename?: string;
    size?: number; // bytes
}

export const getMetaData = async (): Promise<MetaData | null> => {
    try {
        const res = await axios.get('/api/meta');
        return res.data;
    } catch (e) {
        return null;
    }
};
