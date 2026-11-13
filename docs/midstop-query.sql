WITH classified AS (
 SELECT subroute,board_ts,alight_ts,board_stop,alight_stop,
 CASE WHEN CASE board_stop WHEN '台中航空站' THEN 1 WHEN '臺中' THEN 2 WHEN '高鐵臺中站' THEN 3 WHEN '牛耳石雕公園' THEN 4 WHEN '崎下' THEN 5 WHEN '埔里站' THEN 6 WHEN '暨南大學校內' THEN 7 WHEN '暨南大學' THEN 8 WHEN '桃米坑' THEN 9 WHEN '大雁' THEN 10 WHEN '九族文化村' THEN 11 WHEN '魚池' THEN 12 WHEN '日月老茶廠' THEN 13 WHEN '日月潭' THEN 14 WHEN '水社' THEN 15 WHEN '向山行政中心' THEN 16 ELSE NULL END < CASE alight_stop WHEN '台中航空站' THEN 1 WHEN '臺中' THEN 2 WHEN '高鐵臺中站' THEN 3 WHEN '牛耳石雕公園' THEN 4 WHEN '崎下' THEN 5 WHEN '埔里站' THEN 6 WHEN '暨南大學校內' THEN 7 WHEN '暨南大學' THEN 8 WHEN '桃米坑' THEN 9 WHEN '大雁' THEN 10 WHEN '九族文化村' THEN 11 WHEN '魚池' THEN 12 WHEN '日月老茶廠' THEN 13 WHEN '日月潭' THEN 14 WHEN '水社' THEN 15 WHEN '向山行政中心' THEN 16 ELSE NULL END THEN 'outbound'
 WHEN CASE board_stop WHEN '台中航空站' THEN 1 WHEN '臺中' THEN 2 WHEN '高鐵臺中站' THEN 3 WHEN '牛耳石雕公園' THEN 4 WHEN '崎下' THEN 5 WHEN '埔里站' THEN 6 WHEN '暨南大學校內' THEN 7 WHEN '暨南大學' THEN 8 WHEN '桃米坑' THEN 9 WHEN '大雁' THEN 10 WHEN '九族文化村' THEN 11 WHEN '魚池' THEN 12 WHEN '日月老茶廠' THEN 13 WHEN '日月潭' THEN 14 WHEN '水社' THEN 15 WHEN '向山行政中心' THEN 16 ELSE NULL END > CASE alight_stop WHEN '台中航空站' THEN 1 WHEN '臺中' THEN 2 WHEN '高鐵臺中站' THEN 3 WHEN '牛耳石雕公園' THEN 4 WHEN '崎下' THEN 5 WHEN '埔里站' THEN 6 WHEN '暨南大學校內' THEN 7 WHEN '暨南大學' THEN 8 WHEN '桃米坑' THEN 9 WHEN '大雁' THEN 10 WHEN '九族文化村' THEN 11 WHEN '魚池' THEN 12 WHEN '日月老茶廠' THEN 13 WHEN '日月潭' THEN 14 WHEN '水社' THEN 15 WHEN '向山行政中心' THEN 16 ELSE NULL END THEN 'inbound' ELSE 'unknown' END direction
 FROM trips WHERE board_date >= ? AND board_date < ?
), events AS (
 SELECT subroute,direction,board_stop stop,board_ts ts,1 b,0 a FROM classified
 UNION ALL
 SELECT subroute,direction,alight_stop stop,alight_ts ts,0 b,1 a FROM classified WHERE alight_ts IS NOT NULL AND alight_stop IS NOT NULL
)
SELECT date(ts,'unixepoch','+8 hours') date,subroute,direction,stop,
 CAST(strftime('%H',ts,'unixepoch','+8 hours') AS INTEGER) hour,
 sum(b) boardings,sum(a) alightings FROM events GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5;
