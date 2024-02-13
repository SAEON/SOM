import React, {useEffect, useRef, useState} from 'react';

import './ScrollableTable.css';
import GenericData from './GenericData';
import BattVPlot from './BattVPlot';
import DatePicker from 'react-datepicker';
import {
    endOfMonth,
    endOfToday,
    endOfWeek,
    endOfYear,
    endOfYesterday,
    startOfMonth,
    startOfToday,
    startOfWeek,
    startOfYear,
    startOfYesterday,
    subMonths,
    subWeeks,
    subYears
} from 'date-fns';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChartBar, faCheck, faExclamation, faQuestion, faTable, faTimes,} from '@fortawesome/free-solid-svg-icons';
import {faFolder as farFolder, faFolderOpen as farFolderOpen} from '@fortawesome/free-regular-svg-icons';
import 'react-datepicker/dist/react-datepicker.css';
import MyHeatMap from './MyHeatMap';
import CustomModal from './CustomModal';
import ModalContent from './ModalContent';
import {useLocation} from "react-router-dom";


const formatDate = (date) => {
    // Parse the UTC date string
    const utcDate = new Date(date);

    // Convert UTC to South African Standard Time (SAST) which is UTC + 2 hours
    const sastDate = new Date(utcDate.getTime() - (2 * 60 * 60 * 1000));

    // Format the date in 'YYYY-MM-DDTHH:mm:ss' format
    const year = sastDate.getFullYear();
    const month = String(sastDate.getMonth() + 1).padStart(2, '0'); // getMonth() returns 0-11
    const day = String(sastDate.getDate()).padStart(2, '0');
    const hours = String(sastDate.getHours()).padStart(2, '0');
    const minutes = String(sastDate.getMinutes()).padStart(2, '0');
    const seconds = String(sastDate.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};


const ScrollableTable = () => {

    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const requestedSite = queryParams.get("site");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [activeSite, setActiveSite] = useState(null);
    // New state for storing last update dates
    const [lastUpdateDates, setLastUpdateDates] = useState({});
    // Existing states and hooks
    const rowRefs = useRef({});


    // Get today's date
    const today = new Date();
    // Calculate the date 30 days before today
    const thirtyDaysBefore = new Date();
    thirtyDaysBefore.setDate(today.getDate() - 30);

    // Set the initial state for startDate and endDate
    const [startDate, setStartDate] = useState(thirtyDaysBefore);
    const [endDate, setEndDate] = useState(today);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [setDataAvailability] = useState(null);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const fetchLastUpdateForSite = async (siteName) => {
        const site = sites.find(s => s.name === siteName);

        for (const interval of site.intervals) {
            const siteKey = `${siteName}-${interval}`;

            let formattedSiteName = siteName.toLowerCase().split(' ').join('_');
            let formattedInterval = mapIntervalToAPIFormat(interval);
            let url;
            if (siteName === "CR1000 Constantiaberg") {
                formattedSiteName = "constantiaberg";
                url = `/api/last-update-date/${formattedSiteName}.${formattedInterval}`;
            } else {
                url = `/api/last-update-date/${formattedSiteName}.${formattedInterval}`;
            }

            try {
                const response = await fetch(url);
                const data = await response.json();
                const dateCategory = categorizeDate(data.lastupdatetime);

                // Update the state immediately for each interval
                setLastUpdateDates(prevDates => ({
                    ...prevDates,
                    [siteKey]: dateCategory
                }));
            } catch (error) {
                console.error('Error fetching last update date for', siteName, interval, error);
            }
        }
    }
    const categorizeDate = (dateString) => {

        if (!dateString) {
            console.error('Invalid or missing date string');
            return {category: 'Unknown', icon: faQuestion, badgeColor: 'gray-badge'};
        }

        const lastUpdate = new Date(dateString);
        if (isNaN(lastUpdate)) {
            console.error('Invalid date:', dateString);
            return {category: 'Unknown', icon: faQuestion, badgeColor: 'gray-badge'};
        }


        const now = new Date();
        const difference = now.getTime() - lastUpdate.getTime(); // difference in milliseconds

        const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
        const oneWeek = 7 * oneDay; // milliseconds in a week
        const twoWeeks = 2 * oneWeek; // milliseconds in two weeks
        const threeWeeks = 3 * oneWeek; // milliseconds in three weeks
        const oneMonth = 30 * oneDay; // milliseconds in a month
        const oneYear = 365 * oneDay; // milliseconds in a year

        const formattedDate = formatDate(lastUpdate);

        if (difference < oneDay) {
            return {category: `Within a day (${formattedDate})`, icon: faCheck, badgeColor: 'green-badge'};
        } else if (difference < oneWeek) {
            return {category: `Within a Week (${formattedDate})`, icon: faCheck, badgeColor: 'blue-badge'};
        } else if (difference < twoWeeks) {
            return {category: `Updated Last Week (${formattedDate})`, icon: faCheck, badgeColor: 'dark-blue-badge'};
        } else if (difference < threeWeeks) {
            return {category: `Updated 2 Weeks Ago (${formattedDate})`, icon: faCheck, badgeColor: 'yellow-badge'};
        } else if (difference < oneMonth) {
            return {
                category: `Updated 3 Weeks Ago (${formattedDate})`,
                icon: faExclamation,
                badgeColor: 'orange-badge'
            };
        } else if (difference < oneYear) {
            return {category: `Updated This Year (${formattedDate})`, icon: faExclamation, badgeColor: 'red-badge'};
        } else {
            return {
                category: `Updated Over a Year Ago (${formattedDate})`,
                icon: faTimes,
                badgeColor: 'dark-red-badge'
            };
        }
    };
    const [notification, setNotification] = useState({message: '', type: ''});
    const showNotification = (message, type) => {
        setNotification({message, type});

        // Hide the notification after 3 seconds
        setTimeout(() => {
            setNotification({message: '', type: ''});
        }, 3000);
    };
    const mapIntervalToAPIFormat = (interval) => {
        // switch (interval) {
        //     case "30 mins":
        //         return "thirty_min";
        //     case "5 mins":
        //         return "five_min";
        //     case "Table 1":
        //         return "table1";
        //     case "Table 2":
        //         return "table2";
        //     case "Table 3":
        //         return "table3";
        //     case "Table 4":
        //         return "table4";
        //     default:
        return interval.toLowerCase().replace(/\s/g, '_');
        // }/
    };
    const generateEndpoints = (baseURL, intervals) => {
        const obj = {};

        for (let interval of intervals) {
            let lowercaseInterval = interval.toLowerCase().replace(/\s/g, '_');
            // Capitalized interval is the same as formatted, but with the first letter capitalized
            let capitalizedInterval = lowercaseInterval;//.charAt(0).toUpperCase() + lowercaseInterval.slice(1);

            obj[capitalizedInterval] = {
                data: `${baseURL}/${lowercaseInterval}-data`,
                metadata: `${baseURL}/${lowercaseInterval}-metadata`,
                count: `${baseURL}/${lowercaseInterval}-count`,
                csv: `${baseURL}/download-${lowercaseInterval}-csv`
            }
        }
        // console.log(obj);
        return obj;
    }
    const sites = [
        {
            name: "CR1000 Besemfontein",
            intervals: ["public", "daily", "hourly", "thirty_min", "five_min"]
        },
        {
            name: "CR1000 Cath Peak High Alt AWS",
            intervals: ["public", "daily", "hourly", "five_min"]
        },
        {
            name: "CR6 Cath Peak EC Tower",
            intervals: ["public", "config_setting_notes", "flux_amerifluxformat", "flux_csformat", "flux_notes"]
        },
        {
            name: "CR1000 Cath Peak Mikes Pass AWS",
            intervals: ["public", "daily", "hourly", "five_min"]
        },
        {
            name: "CR300 Cath Peak Research Centre",
            intervals: ["public", "daily", "hourly", "five_min"]
        },
        {
            name: "CR1000 Constantiaberg",
            intervals: ["public", "table1", "table2", "table3", "table4"]
        },
        {
            name: "CR1000 Dwarsberg Jonkershoek",
            intervals: ["public", "table1", "table2", "table3", "table4"]
        },
        {
            name: "EFTEON Bambanani ERS",
            intervals: ["public", "tableday", "tablehour", "table10minute"]
        },
        {
            name: "SAEON Arid AWS3 Benfontein",
            intervals: ['public',
                'status',
                'table1',
                'table2',
                'table3']
        },
        {
            name: "EFTEON Benfontein Karoo",
            intervals: ["public", "comp_cov_3d", "comp_cov_3d_5min", "comp_cov_co2", "comp_cov_cs_5min", "comp_cov_fw", "comp_cov_h2o",
                "comp_mean", "config_setting_notes", "const_table", "cpistatus", "datatableinfo", "delay_3d", "delay_cs", "delay_fw", "diagnostic",
                "flux_amerifluxformat", "flux_csiformat", "flux_notes", "met_5min", "met_day", "met_hour", "stats_net_radiation",
                "stats_shf", "stats_tmpr_rh", "status", "time_series"]
        },
        {
            name: "EFTEON Benfontein savanna",
            intervals: ["comp_cov_3d",
                "const_table",
                "comp_cov_cs_5min",
                "comp_cov_co2",
                "comp_cov_fw",
                "cpistatus",
                "comp_mean",
                "config_setting_notes",
                "datatableinfo",
                "comp_cov_h2o",
                "delay_fw",
                "flux_amerifluxformat",
                "delay_cs",
                "comp_cov_3d_5min",
                "met_day",
                "delay_3d",
                "diagnostic",
                "flux_csiformat",
                "met_5min",
                "met_hour",
                "stats_shf",
                "flux_notes",
                "stats_net_radiation",
                "time_series",
                "status",
                "public",
                "stats_tmpr_rh"]
        },
        {
            name: "EFTEON Ezibomvini ERS",
            intervals: ['datatableinfo',
                'tablehour',
                'tableday',
                'public',
                'table10minute',
                'status']
        },
        {
            name: "EFTEON LowveldMRCWits Ers",
            intervals: ['public',
                'status',
                'datatableinfo',
                'tablehour',
                'table10minute',
                'tableday']
        },
        {
            name: "EFTEON LowveldWitsRural AWS",
            intervals: ['daily',
                'public',
                'datatableinfo',
                'status',
                'table10m',
                'tablehour',
                'tablesolarcharger10m',
                'tableday']
        },
        {
            name: "EFTEON Mabasata AWS",
            intervals: ['status',
                'tablehour',
                'public',
                'tableday',
                'datatableinfo']
        },
        {
            name: "EFTEON Maputaland EC",
            intervals: ['delay_3d',
                'public',
                'comp_cov_3d_5min',
                'comp_cov_3d',
                'comp_cov_cs_5min',
                'comp_cov_h2o',
                'comp_mean',
                'comp_cov_fw',
                'datatableinfo',
                'cpistatus',
                'config_setting_notes',
                'const_table',
                'comp_cov_co2',
                'delay_cs',
                'flux_amerifluxformat',
                'diagnostic',
                'delay_fw',
                'flux_csiformat',
                'met_day',
                'met_hour',
                'flux_notes',
                'met_5min',
                'time_series',
                'stats_net_radiation',
                'stats_tmpr_rh',
                'stats_shf',
                'status']
        },


        {
            name: "EFTEON Spioenkop AWS",
            intervals: ['public',
                'datatableinfo',
                'tablehour',
                'status',
                'table10m',
                'tableday',
                'tablesolarcharger10m']
        },

        {
            name: "EFTEON Spioenkop EC",
            intervals: ['comp_cov_3d',
                'comp_cov_co2',
                'comp_cov_fw',
                'comp_cov_h2o',
                'comp_cov_cs_5min',
                'datatableinfo',
                'cpistatus',
                'comp_cov_3d_5min',
                'delay_fw',
                'diagnostic',
                'config_setting_notes',
                'delay_3d',
                'flux_amerifluxformat',
                'flux_notes',
                'flux_csiformat',
                'delay_cs',
                'met_5min',
                'met_day',
                'met_hour',
                'public',
                'stats_net_radiation',
                'stats_shf',
                'stats_tmpr_rh',
                'status',
                'comp_mean',
                'const_table',
                'time_series']
        },



        {
            name: "EFTEON Station 5 Mac Station",
            intervals: ["comp_cov_co2",
                "comp_cov_3d_5min",
                "comp_cov_h2o",
                "comp_cov_fw",
                "datatableinfo",
                "config_setting_notes",
                "comp_cov_3d",
                "cpistatus",
                "comp_mean",
                "comp_cov_cs_5min",
                "diagnostic",
                "const_table",
                "delay_fw",
                "flux_amerifluxformat",
                "delay_3d",
                "flux_csiformat",
                "delay_cs",
                "stats_shf",
                "status",
                "public",
                "flux_notes",
                "stats_tmpr_rh",
                "time_series"]
        },
        {
            name: "EFTEON Station 6 Grass Station",
            intervals: ['comp_cov_fw',
                'comp_cov_3d_5min',
                'comp_cov_co2',
                'comp_cov_cs_5min',
                'comp_cov_3d',
                'config_setting_notes',
                'cpistatus',
                'const_table',
                'comp_cov_h2o',
                'delay_cs',
                'delay_3d',
                'datatableinfo',
                'comp_mean',
                'flux_amerifluxformat',
                'delay_fw',
                'diagnostic',
                'flux_csiformat',
                'met_day',
                'flux_notes',
                'status',
                'met_hour',
                'public',
                'stats_net_radiation',
                'met_5min',
                'stats_shf',
                'time_series',
                'stats_tmpr_rh']
        },
        {
            name: "CR300 Engelsmanskloof",
            intervals: ["public", "table1", "table2"]
        },
        {
            name: "Saeon Haenertsburg AWS",
            intervals: ['datatableinfo',
                'daily',
                'status',
                'public',
                'five_min',
                'hourly']
        },

        {
            name: "CR3000 Jonkershoek EC",
            intervals: ["flux", "flux_notes"]
        },
        {
            name: "Saeon SAWC AWS",
            intervals: ['five_min',
                'datatableinfo',
                'hourly',
                'public',
                'daily',
                'status']
        },


        {
            name: "CR1000 Tierberg",
            intervals: ["public", "table1", "table2"]
        },
        {
            name: "CR1000 Vasi Science Centre AWS",
            intervals: ["public", "daily", "hourly", "five_min"]
        }


    ];





    const efteon_spioenkop_ecintervals = ['comp_cov_3d',
        'comp_cov_co2',
        'comp_cov_fw',
        'comp_cov_h2o',
        'comp_cov_cs_5min',
        'datatableinfo',
        'cpistatus',
        'comp_cov_3d_5min',
        'delay_fw',
        'diagnostic',
        'config_setting_notes',
        'delay_3d',
        'flux_amerifluxformat',
        'flux_notes',
        'flux_csiformat',
        'delay_cs',
        'met_5min',
        'met_day',
        'met_hour',
        'public',
        'stats_net_radiation',
        'stats_shf',
        'stats_tmpr_rh',
        'status',
        'comp_mean',
        'const_table',
        'time_series'];

    const efteon_maputaland_ecintervals = ['delay_3d',
        'public',
        'comp_cov_3d_5min',
        'comp_cov_3d',
        'comp_cov_cs_5min',
        'comp_cov_h2o',
        'comp_mean',
        'comp_cov_fw',
        'datatableinfo',
        'cpistatus',
        'config_setting_notes',
        'const_table',
        'comp_cov_co2',
        'delay_cs',
        'flux_amerifluxformat',
        'diagnostic',
        'delay_fw',
        'flux_csiformat',
        'met_day',
        'met_hour',
        'flux_notes',
        'met_5min',
        'time_series',
        'stats_net_radiation',
        'stats_tmpr_rh',
        'stats_shf',
        'status'];

    const saeon_sawc_awsintervals = ['five_min',
        'datatableinfo',
        'hourly',
        'public',
        'daily',
        'status'];

    const efteon_spioenkop_awsintervals =['public',
        'datatableinfo',
        'tablehour',
        'status',
        'table10m',
        'tableday',
        'tablesolarcharger10m'];

    const efteon_mabasata_awsintervals =['status',
        'tablehour',
        'public',
        'tableday',
        'datatableinfo'];

    const efteon_lowveldwitsrural_awsintervals = ['daily',
        'public',
        'datatableinfo',
        'status',
        'table10m',
        'tablehour',
        'tablesolarcharger10m',
        'tableday'];

    const efteon_lowveldmrcwits_ersintervals = ['public',
        'status',
        'datatableinfo',
        'tablehour',
        'table10minute',
        'tableday'];
    const saeon_arid_aws3_benfonteinintervals =
        ['public',
            'status',
            'table1',
            'table2',
            'table3'];
    const efteon_station_6_grass_stationintervals =
    ['comp_cov_fw',
        'comp_cov_3d_5min',
        'comp_cov_co2',
        'comp_cov_cs_5min',
        'comp_cov_3d',
        'config_setting_notes',
        'cpistatus',
        'const_table',
        'comp_cov_h2o',
        'delay_cs',
        'delay_3d',
        'datatableinfo',
        'comp_mean',
        'flux_amerifluxformat',
        'delay_fw',
        'diagnostic',
        'flux_csiformat',
        'met_day',
        'flux_notes',
        'status',
        'met_hour',
        'public',
        'stats_net_radiation',
        'met_5min',
        'stats_shf',
        'time_series',
        'stats_tmpr_rh'];
    const efteon_ezibomvini_ersintervals = ['datatableinfo',
        'tablehour',
        'tableday',
        'public',
        'table10minute',
        'status'];
    const saeon_haenertsburg_awsintervals = ['datatableinfo',
        'daily',
        'status',
        'public',
        'five_min',
        'hourly'];
    const efteon_benfontein_savanna = ["comp_cov_3d",
        "const_table",
        "comp_cov_cs_5min",
        "comp_cov_co2",
        "comp_cov_fw",
        "cpistatus",
        "comp_mean",
        "config_setting_notes",
        "datatableinfo",
        "comp_cov_h2o",
        "delay_fw",
        "flux_amerifluxformat",
        "delay_cs",
        "comp_cov_3d_5min",
        "met_day",
        "delay_3d",
        "diagnostic",
        "flux_csiformat",
        "met_5min",
        "met_hour",
        "stats_shf",
        "flux_notes",
        "stats_net_radiation",
        "time_series",
        "status",
        "public",
        "stats_tmpr_rh"];
    const efteon_benfontein_karoointervals = ["public", "comp_cov_3d", "comp_cov_3d_5min", "comp_cov_co2", "comp_cov_cs_5min", "comp_cov_fw", "comp_cov_h2o", "comp_mean", "config_setting_notes", "const_table", "cpistatus", "datatableinfo", "delay_3d", "delay_cs", "delay_fw", "diagnostic", "flux_amerifluxformat", "flux_csiformat", "flux_notes", "met_5min", "met_day", "met_hour", "stats_net_radiation",
        "stats_shf", "stats_tmpr_rh", "status", "time_series"];
    const efteon_station_5_mac_station =
        ["comp_cov_co2",
            "comp_cov_3d_5min",
            "comp_cov_h2o",
            "comp_cov_fw",
            "datatableinfo",
            "config_setting_notes",
            "comp_cov_3d",
            "cpistatus",
            "comp_mean",
            "comp_cov_cs_5min",
            "diagnostic",
            "const_table",
            "delay_fw",
            "flux_amerifluxformat",
            "delay_3d",
            "flux_csiformat",
            "delay_cs",
            "stats_shf",
            "status",
            "public",
            "flux_notes",
            "stats_tmpr_rh",
            "time_series"];
    const efteon_bambanani_ersintervals = ["public", "tableday", "tablehour", "table10minute"];
    const intervals = ["public", "daily", "hourly", "five_min"];
    const intervals2 = ["public", "daily", "hourly", "thirty_min", "five_min"];
    const constantiabergintervals = ["public", "table1", "table2", "table3", "table4"];
    const tierbergintervals = ["public", "table1", "table2"];
    const jonkershoekecintervals = ["flux", "flux_notes"];
    const CR6CathPeakECTowerintervals = ["public", "config_setting_notes", "flux_amerifluxformat", "flux_csformat", "flux_notes"];

    const siteEndpoints = {

        "EFTEON Spioenkop EC": generateEndpoints('/api/efteon-spioenkop-ec', efteon_spioenkop_ecintervals),


        "EFTEON Maputaland EC": generateEndpoints('/api/efteon-maputaland-ec', efteon_maputaland_ecintervals),


        "Saeon SAWC AWS":generateEndpoints('/api/saeon-sawc-aws', saeon_sawc_awsintervals),

        "EFTEON Spioenkop AWS":generateEndpoints('/api/efteon-spioenkop-aws', efteon_spioenkop_awsintervals),
        "EFTEON Mabasata AWS":generateEndpoints('/api/efteon-mabasata-aws', efteon_mabasata_awsintervals),



        "EFTEON LowveldWitsRural AWS":generateEndpoints('/api/efteon-lowveldwitsrural-aws', efteon_lowveldwitsrural_awsintervals),


        "EFTEON LowveldMRCWits Ers":generateEndpoints('/api/efteon-lowveldmrcwits-ers', efteon_lowveldmrcwits_ersintervals),


        "SAEON Arid AWS3 Benfontein": generateEndpoints('/api/saeon-arid-aws3-benfontein', saeon_arid_aws3_benfonteinintervals),


        "EFTEON Station 6 Grass Station": generateEndpoints('/api/efteon-station-6-grass-station', efteon_station_6_grass_stationintervals),


        "EFTEON Ezibomvini ERS": generateEndpoints('/api/efteon-ezibomvini-ers', efteon_ezibomvini_ersintervals),

        "Saeon Haenertsburg AWS": generateEndpoints('/api/saeon-haenertsburg-aws', saeon_haenertsburg_awsintervals),

        "EFTEON Benfontein savanna": generateEndpoints('/api/efteon-benfontein-savanna', efteon_benfontein_savanna),

        "EFTEON Station 5 Mac Station": generateEndpoints('/api/efteon-station-5-mac-station', efteon_station_5_mac_station),
        "EFTEON Benfontein Karoo": generateEndpoints('/api/efteon-benfontein-karoo', efteon_benfontein_karoointervals),
        "EFTEON Bambanani ERS": generateEndpoints('/api/efteon-bambanani-ers', efteon_bambanani_ersintervals),
        "CR1000 Besemfontein": generateEndpoints('/api/besemfontein', intervals2),
        "CR1000 Cath Peak High Alt AWS": generateEndpoints('/api/cr1000-cath-peak-high-alt-aws', intervals),
        "CR1000 Vasi Science Centre AWS": generateEndpoints('/api/vasi-science-centre-aws', intervals),
        "CR1000 Cath Peak Mikes Pass AWS": generateEndpoints('/api/cr1000-cath-peak-mikes-pass-aws', intervals),
        "CR300 Cath Peak Research Centre": generateEndpoints('/api/cr300-cath-peak-research-centre', intervals),
        "CR1000 Constantiaberg": generateEndpoints('/api/constantiaberg', constantiabergintervals),
        "CR300 Engelsmanskloof": generateEndpoints('/api/cr300-engelsmanskloof', tierbergintervals),
        "CR3000 Jonkershoek EC": generateEndpoints('/api/cr3000-jonkershoek-ec', jonkershoekecintervals),
        "CR1000 Tierberg": generateEndpoints('/api/cr1000-tierberg', tierbergintervals),
        "CR1000 Dwarsberg Jonkershoek": generateEndpoints('/api/cr1000-dwarsberg-jonkershoek', constantiabergintervals),
        "CR6 Cath Peak EC Tower": generateEndpoints('/api/cr6-cath-peak-ec-tower', CR6CathPeakECTowerintervals),
    };
    const handleModalOpen = (siteName, interval, contentType) => {

        setIsModalOpen(true);

        const endpoints = siteEndpoints[siteName][interval];

        let contentComponent;

        if (contentType === 'battv' || contentType === 'batt_volt' || contentType === 'batt_volt_avg' || contentType === 'constantiaberg_table2_battv') {
            contentComponent = (
                <BattVPlot dataEndpoint={endpoints.battv}/>
            );
        } else {
            contentComponent = (
                <GenericData
                    dataEndpoint={endpoints.data}
                    metadataEndpoint={endpoints.metadata}
                    countEndpoint={endpoints.count}
                    csvDownloadEndpoint={endpoints.csv}
                />
            );
        }
        setModalContent(contentComponent);
    };
    const handleModalClose = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };
    // Function to toggle the active site and fetch data
    const toggleActiveSite = (siteName) => {
        // console.log(siteName);
        const isActive = activeSite === siteName;
        setActiveSite(isActive ? null : siteName); // Toggle active site

        // Fetch last update date whenever a site is expanded
        if (!isActive) {
            fetchLastUpdateForSite(siteName);
        }
    };
    const getQuarterDates = (quarterNumber) => {
        const today = new Date();
        let financialYearStart = today.getFullYear();

        // If current month is before April, the financial year started last year
        if (today.getMonth() < 3) {
            financialYearStart -= 1;
        }

        switch (quarterNumber) {
            case 1: // April - June
                return {startDate: new Date(financialYearStart, 3, 1), endDate: new Date(financialYearStart, 5, 30)};
            case 2: // July - September
                return {startDate: new Date(financialYearStart, 6, 1), endDate: new Date(financialYearStart, 8, 30)};
            case 3: // October - December
                return {startDate: new Date(financialYearStart, 9, 1), endDate: new Date(financialYearStart, 11, 31)};
            case 4: // January - March (next year)
                return {
                    startDate: new Date(financialYearStart + 1, 0, 1),
                    endDate: new Date(financialYearStart + 1, 2, 31)
                };
            default:
                return {startDate: new Date(), endDate: new Date()};
        }
    }
// Date range selection handlers
    const handleSelectYesterday = () => handleDateRangeSelection(startOfYesterday(), endOfYesterday());
    const handleSelectThisWeek = () => handleDateRangeSelection(startOfWeek(new Date()), endOfWeek(new Date()));
    const handleSelectLastWeek = () => handleDateRangeSelection(startOfWeek(subWeeks(new Date(), 1)), endOfWeek(subWeeks(new Date(), 1)));
    const handleSelectThisMonth = () => handleDateRangeSelection(startOfMonth(new Date()), endOfMonth(new Date()));
    const handleSelectLastMonth = () => handleDateRangeSelection(startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1)));
    const handleSelectLastYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 1)), endOfYear(subYears(new Date(), 1)));
    const handleSelectThisYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 0)), endOfYear(subYears(new Date(), 0)));
    const handleSelectQuarter = (quarterNumber) => {
        const {startDate, endDate} = getQuarterDates(quarterNumber);
        handleDateRangeSelection(startDate, endDate);
    };
    const handleDateRangeSelection = (start, end) => {
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Set to the end of today

        // Ensure end date is not after today
        const adjustedEndDate = new Date(Math.min(end, today));

        setStartDate(start);
        setEndDate(adjustedEndDate);
        // setEndDate(end);
    };
    const handleDataStats = async () => {
        setIsModalOpen(true);

        // Format dates to 'YYYY-MM-DD' format
        const formattedStartDate = startDate.toISOString().split('T')[0];
        // const formattedEndDate = endDate.toISOString().split('T')[0];

        // Adding one day to endDate
        const newEndDate = new Date(endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        const formattedEndDate = newEndDate.toISOString().split('T')[0];


        const url = `/api/cr300_cath_peak_research_centre/hourly/check?startDate=${formattedStartDate}&endDate=${formattedEndDate}&excludedFields=time,battv`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            // console.log(data);
            setDataAvailability(data.availabilityData);
            setModalContent(<MyHeatMap data={data.availabilityData}/>);

            // setModalContent(renderHeatMap(data.availabilityData));
        } catch (error) {
            console.error('Error fetching data availability stats:', error);
        }
    };
    const handleSpecialAction = async (siteName, interval) => {
        showNotification("Loading data...", "loading");

        const formattedStartDate = startDate.toISOString().split('T')[0];
        const newEndDate = new Date(endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        const formattedEndDate = newEndDate.toISOString().split('T')[0];

        let formattedSiteName = siteName === "CR1000 Constantiaberg" ? "constantiaberg" : siteName.toLowerCase().split(' ').join('_');
        let formattedInterval = mapIntervalToAPIFormat(interval);

        const url = `/api/${formattedSiteName}/${formattedInterval}/check?startDate=${formattedStartDate}&endDate=${formattedEndDate}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch data');
            }
            const data = await response.json();

            // Calculate average availability
            let totalPercentageMissing = 0;
            let variableCount = 0;
            Object.entries(data.summary).forEach(([_, value]) => {
                totalPercentageMissing += value.percentageMissing;
                variableCount++;
            });
            const averageAvailability = variableCount > 0 ? 100 - (totalPercentageMissing / variableCount) : 0;

            setModalContent(
                <ModalContent
                    data={data}
                    siteName={siteName}
                    interval={interval}
                    averageAvailability={averageAvailability}
                />
            );

            setIsCustomModalOpen(true);
            showNotification("", "");
        } catch (error) {
            console.error('Error in special action for', siteName, interval, ':', error);
            showNotification('Failed to load data. Please try again.', 'error');
        }
    };
    const closeCustomModal = () => {
        setIsCustomModalOpen(false);
    };
    const handleDropdownClick = () => {
        const isOpening = !dropdownOpen;
        setDropdownOpen(isOpening);

        // Disable body scroll when dropdown is open
        document.body.style.overflow = isOpening ? 'hidden' : 'auto';
    };

    // console.log(requestedSite);
    useEffect(() => {
        if (requestedSite) {
            setActiveSite(requestedSite);
        }
    }, [requestedSite]);


    useEffect(() => {
        // This ensures that whenever activeSite changes, we perform all necessary updates
        if (activeSite) {
            fetchLastUpdateForSite(activeSite); // Fetch latest data for the site

            // Scroll the active site into view
            if (rowRefs.current[activeSite]) {
                rowRefs.current[activeSite].scrollIntoView({behavior: 'smooth', block: 'start'});
            }

            // Add any additional logic here that needs to run when activeSite changes
        }
    }, [activeSite]); // Depend on activeSite to trigger this effect

    return (
        <div className="scrollable-table-container">
            {/* Add the date range picker and buttons here */}
            <div className="date-controls-container">
                <div className="controls-header">
                    <h2>Select date parameters for reporting</h2>
                    <p className="date-instructions">
                        Choose a predefined (dropdown) or custom (date pickers) date range for site-specific or
                        station-wide data availability reports using the data availability buttons.
                    </p>
                </div>

                <div className="controls-content">
                    <div className="dropdown-container">
                        <button className="dropdown-button" onClick={handleDropdownClick}>
                            {dropdownOpen ? "Select Date Range ▲" : "Select Date Range ▼"}
                        </button>
                        {dropdownOpen && (
                            <div className="dropdown-menu">
                                {/*<div className="dropdown-menu">*/}
                                <button className="dropdown-item" onClick={() => {
                                    handleDateRangeSelection(startOfToday(), endOfToday());
                                    handleDropdownClick();
                                }}>Today
                                </button>
                                <button className="dropdown-item" onClick={() => {
                                    handleSelectYesterday();
                                    handleDropdownClick();
                                }}>Yesterday
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectThisWeek();
                                    handleDropdownClick();
                                }}>This Week
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectLastWeek();
                                    handleDropdownClick();
                                }}>Last Week
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectThisMonth();
                                    handleDropdownClick();
                                }}>This Month
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectLastMonth();
                                    handleDropdownClick();
                                }}>Last Month
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectThisYear();
                                    handleDropdownClick();
                                }}>This Year
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectLastYear();
                                    handleDropdownClick();
                                }}>Last Year
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(1);
                                    handleDropdownClick();
                                }}>1st Quarter
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(2);
                                    handleDropdownClick();
                                }}>2nd Quarter
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(3);
                                    handleDropdownClick();
                                }}>3rd Quarter
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(4);
                                    handleDropdownClick();
                                }}>4th Quarter
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="date-picker-container">
                        {/* Date Pickers */}
                        <DatePicker
                            selected={startDate}
                            onChange={date => setStartDate(date)}
                            selectsStart
                            startDate={startDate}
                            endDate={endDate}
                            dateFormat="dd-MM-yyyy"  // Updated format
                        />
                        <DatePicker
                            selected={endDate}
                            onChange={date => setEndDate(date)}
                            selectsEnd
                            startDate={startDate}
                            endDate={endDate}
                            minDate={startDate}
                            dateFormat="dd-MM-yyyy"  // Updated format
                        />
                    </div>
                    {/* Data Availability Button or Container */}
                    <div className="data-availability-container">
                        <button className="data-stats-button" onClick={handleDataStats}>
                            Data Availability Stats
                        </button>
                    </div>
                </div>
            </div>
            {isModalOpen && (
                <div className="modal-background">
                    <div className="modal-content">
                        <button className="close-button" onClick={handleModalClose}>
                            <FontAwesomeIcon icon={faTimes}/> {/* Use Font Awesome icon */}
                        </button>
                        {modalContent}
                    </div>
                </div>
            )}
            {isCustomModalOpen && (
                <CustomModal isOpen={isCustomModalOpen} onClose={closeCustomModal}>
                    {modalContent}
                </CustomModal>
            )}
            <table>
                <tbody>
                {sites.map((site) => (

                    <React.Fragment key={site.name}>
                        <tr
                            ref={el => rowRefs.current[site.name] = el}
                        >
                            {/*<tr className={`${activeSite === site.name ? 'active' : ''} ${lastUpdateDates[site.name]?.badgeColor || ''}`}>*/}
                            <td colSpan={6}>
                                {/*<button className="site-name-button" onClick={() => toggleActiveSite(site.name)}>*/}
                                {/*    {site.name} {activeSite === site.name ? '▲' : '▼'}*/}
                                {/*</button>*/}
                                <button className="site-name-button" onClick={() => toggleActiveSite(site.name)}>
                                    <FontAwesomeIcon icon={activeSite === site.name ? farFolderOpen : farFolder}
                                                     className="icon-left"/>
                                    {site.name}
                                    {activeSite === site.name ? ' ▲' : ' ▼'}
                                </button>
                            </td>
                        </tr>


                        {activeSite === site.name && site.intervals.map(interval => (
                            <tr key={interval} className={lastUpdateDates[`${site.name}-${interval}`]?.badgeColor}>
                                <td colSpan={6}>
                                    <button className="view-data-button"
                                            onClick={() => handleModalOpen(site.name, interval, 'view')}>
                                        <FontAwesomeIcon icon={faTable}/> {interval} Data
                                    </button>
                                    {/*{interval === "Public" && (*/}
                                    {/*    <button className="view-data-button"*/}
                                    {/*            onClick={() => handleModalOpen(site.name, interval, 'battv')}>*/}
                                    {/*        <FontAwesomeIcon icon={faChartLine}/> Battv*/}
                                    {/*    </button>*/}
                                    {/*)}*/}
                                    {/*{((site.name === "CR1000 Constantiaberg" && interval === "Table 2")) && (*/}
                                    {/*    <button className="view-data-button"*/}
                                    {/*            onClick={() => handleModalOpen(site.name, interval, 'constantiaberg_table2_battv')}>*/}
                                    {/*        <FontAwesomeIcon icon={faChartLine}/> Battv*/}
                                    {/*    </button>*/}
                                    {/*)}*/}
                                    {/*{((site.name === "CR3000 Jonkershoek EC" && interval === "Flux Notes")) && (*/}
                                    {/*    <button className="view-data-button"*/}
                                    {/*            onClick={() => handleModalOpen(site.name, interval, 'batt_volt_avg')}>*/}
                                    {/*        <FontAwesomeIcon icon={faChartLine}/> Battv*/}
                                    {/*    </button>*/}
                                    {/*)}*/}

                                    {notification.message && (
                                        <div className={`notification-popup ${notification.type}`}>
                                            {notification.message}
                                        </div>
                                    )}
                                    {((interval !== "public" && interval !== "config_setting_notes")) && (
                                        <button className="special-action-button"
                                                onClick={() => handleSpecialAction(site.name, interval)}>
                                            <FontAwesomeIcon icon={faChartBar}/> Data availability
                                        </button>
                                    )}
                                    Last Update: {lastUpdateDates[`${site.name}-${interval}`]?.category}
                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default ScrollableTable;
