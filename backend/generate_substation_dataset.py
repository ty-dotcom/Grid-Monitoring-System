
from earth_osm import eo

if __name__ == '__main__':

    eo.save_osm_data(
            primary_name='power',
            region_list=['belize', 'brazil', 'canada', 'china', 'egypt', 'france', 'guyana',
                         'netherlands', 'nigeria', 'papua-new-guinea', 'philippines', 'us'], #add/remove countries of your choosing
            feature_list=['substation'],
            update=False,
            mp=True,
            data_dir='./earth_data',
            out_format=['csv'],
            out_aggregate=False,
            data_source='overpass' # if your country's data cannot be found switch to geofabrik
        )
