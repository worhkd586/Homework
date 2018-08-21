##분포차트는 세가지로 이루어져있다. 첫번째는 히스토그램이다.
##히스토그램은 각 데이터안의 비슷한 값들을 지닌다.
##두번째는 rug plot marks이다. lug plot은 Histogram이 보여주지 못하는 값을 설명한다.
##세번쨰는 kernel density estimate이다.
##히스토그램 데이터가 많을 수록 가독성이 좋은 그래프 표현 가능

import plotly.offline as pyo
import plotly.figure_factory as ff ##좀더 복잡한구조의 그래프표현시 사용하는 패키지
import numpy as np

snodgrass = [.209,.205,.196,.210,.202,.207,.224,.223,.220,.201]
twain = [.225,.262,.217,.240,.230,.229,.235,.217]

hist_data =[snograss, twain]
group_labels = ['snodgrass writings', 'twain writings']

fig = ff.create_distplot(hist_data, group_labels, bin_size=[0.005, 0.005])
pyo.plot(fig)
