import React, { useState, useEffect, useRef, useCallback } from 'react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { PlusOutlined, MinusOutlined } from '@ant-design/icons';

dayjs.extend(duration);

const CountdownFloating = () => {
    const [allFutureShows, setAllFutureShows] = useState([]);
    const [timeLefts, setTimeLefts] = useState({});
    const [isExpanded, setIsExpanded] = useState(false);
    const timerRef = useRef(null);

    const updateShows = useCallback(async () => {
        try {
            const res = await fetch("/api/shows");
            const allShows = await res.json();
            const now = dayjs();
            
            // 过滤并排序未来的演出
            const futureShows = allShows
                .filter(s => dayjs(s.sale_time).isAfter(now))
                .sort((a, b) => dayjs(a.sale_time).diff(dayjs(b.sale_time)));
            
            setAllFutureShows(futureShows);
        } catch (e) {
            console.error("Fetch shows failed", e);
        }
    }, []);

    useEffect(() => {
        updateShows();
        window.addEventListener('shows-updated', updateShows);
        const fetchTimer = setInterval(updateShows, 30000);
        return () => {
            window.removeEventListener('shows-updated', updateShows);
            clearInterval(fetchTimer);
        };
    }, [updateShows]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        
        timerRef.current = setInterval(() => {
            const now = dayjs();
            const newTimeLefts = {};
            allFutureShows.forEach(show => {
                const diff = dayjs(show.sale_time).diff(now);
                if (diff <= 0) {
                    newTimeLefts[show.id] = "已开票";
                } else {
                    const dur = dayjs.duration(diff);
                    const days = Math.floor(dur.asDays());
                    const hours = dur.hours();
                    const minutes = dur.minutes();
                    const seconds = dur.seconds();
                    
                    let str = "";
                    if (days > 0) str += `${days}天`;
                    str += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    newTimeLefts[show.id] = str;
                }
            });
            setTimeLefts(newTimeLefts);
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [allFutureShows]);

    if (allFutureShows.length === 0) return null;

    const mainShow = allFutureShows[0];

    return (
        <div 
            className="countdown-floating" 
            onClick={() => setIsExpanded(!isExpanded)}
        >
            <div className="countdown-single-line">
                <div className="countdown-name">{mainShow.show_name}</div>
                <div className="countdown-time">{timeLefts[mainShow.id] || '--:--:--'}</div>
                {allFutureShows.length > 1 && (
                    <div className="countdown-expand-icon">
                        {isExpanded ? <MinusOutlined /> : <PlusOutlined />}
                    </div>
                )}
            </div>
            
            {isExpanded && allFutureShows.length > 1 && (
                <div className="countdown-list">
                    {allFutureShows.slice(1).map(show => (
                        <div key={show.id} className="countdown-item">
                            <div className="countdown-name">{show.show_name}</div>
                            <div className="countdown-time">{timeLefts[show.id] || '--:--:--'}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CountdownFloating;
